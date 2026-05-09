# 워크스페이스 전환 시 터미널 검은 화면 / 스크롤 깨짐 — 원인 분석

작성일: 2026-05-09
스택: React 19 + xterm.js v5 + @xterm/addon-fit + @xterm/addon-webgl + @xterm/addon-web-links
관련 코드: `frontend/src/components/Terminal/TerminalPanel.tsx`, `frontend/src/hooks/useTerminal.ts`

---

## 1. 증상

| 시점 | 동작 |
|------|------|
| 첫 진입 | 정상. WS1의 터미널이 잘 표시되고 입출력 동작 |
| WS1 → WS2 → WS1 복귀 | **완전 검은 화면**, 커서 안 보임, 키보드 입력 무반응, 마우스 휠/스크롤 동작 안 함, 화면 하단에 "이전 명령어들이 박혀 있는" 상태로 멈춤 |
| 새로고침 | 복구 (인스턴스가 새로 만들어지므로) |
| 윈도우 리사이즈 / 사이드바 드래그 / 탭 클릭 | 복구 못 함 |

키보드 입력은 백엔드 PTY까지 도달하는 것으로 추정 (백엔드는 정상). 시각적으로 보이지 않을 뿐.

## 2. 현재 우리 코드 동작

### 프론트엔드 렌더 모델
- `TerminalPanel`: 모든 워크스페이스의 모든 세션을 동시에 마운트. wrapper의 `display`만 `block` ↔ `none` 토글.
- `useTerminal`: 세션별 xterm `Terminal` 인스턴스를 모듈 스코프 `Map`에 캐시. 동일 세션의 컴포넌트가 다시 마운트되면 캐시된 인스턴스를 재사용.
- WebglAddon 사용 (canvas/DOM renderer 대비 성능).
- ResizeObserver: 0×0 발화 시 skip + hidden→visible 전환 시 `terminal.refresh()`.

### 백엔드
- tmux 세션은 영속. WebSocket으로 attach. 워크스페이스 전환과 무관하게 PTY는 살아 있음.

## 3. 근본 원인 (외부 자료 근거)

### 원인 A — xterm.js는 `display:none` 컨테이너를 설계상 지원하지 않음

**[xtermjs/xterm.js#3029 — "FitAddon and display 'none'"](https://github.com/xtermjs/xterm.js/issues/3029)** (CLOSED, "by design")
> 메인테이너 Daniel Imms (Tyriar): "Display none means we can't pull the calculated values off of the element, just like if it wasn't attached to the DOM."

→ `display:none` 상태에서 fit/measure 호출은 **공식 미지원**. 권장 워크어라운드는 보이기 직전에 `terminal.resize(cols, rows)`로 명시적 사이즈를 먼저 셋하고, 보인 뒤 `fit()` 호출.

**[xtermjs/xterm.js#494 — "Resizing a terminal that is not being displayed will break the viewport/scroll area"](https://github.com/xtermjs/xterm.js/issues/494)** (CLOSED, fixed in 2.3.0 for that specific case)
> "This is happening because the terminal container is being hidden which causes `CharMeasure` to return 0 which puts the viewport into an invalid state."

→ 컨테이너가 hidden일 때 폰트 측정이 0을 반환 → viewport 내부 상태가 invalid가 됨. **스크롤 동작 불능과 "이전 명령어가 박혀있는" 증상의 직접 원인.** 2.x에서 해당 경로의 fix가 들어갔지만, v4/v5에서 측정 API가 바뀌면서 같은 클래스의 버그가 #4560 등으로 재발.

**[xtermjs/xterm.js#4560 — "'getRasterizedGlyph' when a target element is not displayed"](https://github.com/xtermjs/xterm.js/issues/4560)** (CLOSED, type/bug)
> "After upgrading from 4.18.0 to 5.2.1, if the mount point is not displayed (e.g. some parent has `display: none`), this causes an error and xterm crashes."

→ display:none 상태에서 글리프 렌더러가 unitialized 상태에 빠지고, 이후 첫 렌더 시도에서 예외 가능.

### 원인 B — WebglAddon의 컨텍스트 한도

**[xtermjs/xterm.js#4379 — "Support dozens of terminals on a single page"](https://github.com/xtermjs/xterm.js/issues/4379)** (OPEN)
> Terminal7 작성자: "Browsers have a strict limit on the number of active WebGL contexts on a page. Terminal7's multiplexer often needs dozens of panes and the browser does not support it."

→ Chrome 약 16개 한도. 초과 시 오래된 컨텍스트 silent eviction. **검은 화면의 직접 원인.** hidden 상태인 컨텍스트도 회수 대상.

우리 케이스: 세션 수가 많지 않아도, hidden 상태에서 브라우저가 GPU 자원 회수를 위해 컨텍스트를 잃을 수 있음. 모바일에서 더 빈번 (Apple Developer Forums #737042 — iOS Safari background 시 webglcontextlost 발화).

### 원인 C — WebglAddon 컨텍스트 손실은 자동 복구되지 않음 (우리 코드에 핸들러 없음)

`addons/addon-webgl/src/WebglRenderer.ts` 소스 확인 결과:
```ts
this._register(addDisposableListener(this._canvas, 'webglcontextlost', (e) => {
  e.preventDefault();
  this._contextRestorationTimeout = setTimeout(() => {
    this._onContextLoss.fire(e);  // 3초 안에 restore 안 오면 발화
  }, 3000);
}));
this._register(addDisposableListener(this._canvas, 'webglcontextrestored', (e) => {
  removeTerminalFromCache(this._terminal);
  this._initializeWebGLState();
  this._requestRedrawViewport();
}));
```

**[WebglAddon README](https://github.com/xtermjs/xterm.js/blob/master/addons/addon-webgl/README.md)** 권장 패턴:
```ts
const addon = new WebglAddon();
addon.onContextLoss(e => addon.dispose());
terminal.loadAddon(addon);
```

우리 코드는 `onContextLoss` 핸들러를 등록하지 않음:
```ts
// frontend/src/hooks/useTerminal.ts
try {
  inst.terminal.loadAddon(new WebglAddon());
} catch {
  console.warn('WebGL addon failed, using canvas renderer');
}
```

→ 컨텍스트 손실 시 dispose도 안 일어나고 canvas renderer로 fallback도 안 됨. **무한히 검은 화면 상태가 됨.**

### 원인 D — 입력 무반응의 정체

키보드 입력은 PTY까지 정상 전달됨 (서버는 살아 있고 `term.onData`가 ws.send 호출). 단지 시각적 출력이 검은 화면에 가려져 안 보일 뿐. 사용자 관점에서 "입력 무반응"으로 보이는 이유는 echo가 화면에 안 그려지기 때문. xterm 자체는 죽지 않음.

이는 viewport corruption (원인 A)과 WebGL framebuffer blank (원인 C)의 복합 결과.

## 4. 우리가 시도한 fix와 왜 부족했나

| 시도 | 커밋 | 결과 | 부족한 이유 |
|------|------|------|------------|
| `terminal.element` appendChild로 재사용 | `cc00056` | 부분 효과 | DOM attach는 회복했지만 viewport 상태와 WebGL framebuffer는 못 살림 |
| 모든 세션 동시 mount + display 토글 | `a03fe9b` | 무효 | `display:none` 자체가 #3029 가이드 위배. xterm은 hidden 상태를 지원 안 함 |
| ResizeObserver 0×0 가드 + refresh() | `276fcad` | 무효 | refresh()는 buffer를 다시 그리지만, **viewport corruption과 WebGL 컨텍스트 손실은 회복 안 됨** |
| 마운트/onopen의 hasRealSize 가드 추가 | (포함됨) | 회귀 발생 | 첫 진입까지 깨뜨림 → 되돌림 (`1331507`) |

핵심 깨달음: **우리는 잘못된 패턴을 고수하고 있다.** `display:none` 토글로 다중 xterm 인스턴스를 관리하는 패턴은 xterm.js 메인테이너 본인이 미지원이라고 명시한 케이스다.

## 5. 다른 프로젝트들의 해법

| 프로젝트 | 패턴 | 출처 |
|----------|------|------|
| **VS Code** | xterm 인스턴스는 살려두고 **DOM 노드를 활성 컨테이너에 detach/reattach**. display 토글 사용 안 함. WebGL 컨텍스트 손실 시 canvas로 자동 fallback | microsoft/vscode#120393, #158595 |
| **OpenCode (anomalyco)** | 활성 1개만 mount. 비활성 시 SerializeAddon으로 buffer 직렬화. 재활성 시 새 Terminal 만들고 buffer write + cursor 기반 byte replay | anomalyco/opencode `terminal-panel.tsx` |
| **Theia** | xterm widget을 attach/detach. display 토글 사용 안 함 | eclipse-theia/theia `terminal-widget.ts` |
| **ttyd / Wetty** | 페이지당 단일 세션. 다중 세션 토글 자체가 없음 | — |
| **Terminal7** | display 토글 사용. WebGL 컨텍스트 한도 문제로 #4379를 직접 제기. 미해결 | xtermjs#4379 |

**xterm.js + 다중 세션 + display 토글 조합으로 성공한 공개 프로젝트는 발견되지 않음.**

## 6. 해결 방향 옵션

### 방향 ① — WebglAddon 제거 (즉시 검증, 작업량 최소)
- WebglAddon 로드 3줄 제거. canvas renderer 사용.
- WebGL framebuffer 손실 자체가 원천 차단 → 검은 화면 가설 확정/반증 가능.
- **단**: viewport corruption (#494)은 WebGL과 무관 → **스크롤 이슈는 여전할 가능성 높음**.
- 성능 저하 (대량 출력 시 체감), 그러나 우리 사용 패턴엔 미미할 수 있음.

### 방향 ② — VS Code 방식 (xterm.js 권장 패턴, 중간 작업량)
- TerminalPanel을 활성 1개만 렌더링하는 구조로 변경.
- React가 unmount하지 않게 인스턴스/element는 모듈 스코프에 보관, 활성 컨테이너에 직접 `appendChild`로 DOM 이동.
- 비활성 세션의 element는 DOM에서 빠져 있으므로 #494/#3029 미지원 케이스를 회피.
- WebglAddon `onContextLoss` 핸들러도 함께 등록 (모바일/장기 hidden 대비).
- xterm.js 공식 권장 + VS Code 검증된 패턴 → 가장 견고.

### 방향 ③ — OpenCode 방식 (직렬화/복원, 큰 리팩터링)
- 활성 1개만 mount + 비활성 직렬화. 메모리 가장 효율적.
- xterm.js의 공식 `@xterm/addon-serialize` 사용 가능.
- 작업량 큼: backend cursor/byte-offset replay까지 가면 tmux 우회해야 함.
- 지금은 ROI 낮음.

## 7. 권장 진행 순서

1. **방향 ① 즉시 검증** — WebGL 한 줄 주석 처리 후 사용자 테스트. 결과로 검은 화면이 사라지면 WebGL 컨텍스트 손실이 핵심 원인 확정. 스크롤이 여전히 깨지면 viewport corruption도 같이 풀어야 함을 데이터로 확인.
2. **방향 ② 본격 적용** — 결과와 무관하게 VS Code 패턴으로 가는 게 옳음. xterm.js 공식 입장이 분명한 이상 `display:none` 토글 자체를 폐기.
3. **방향 ② 안에 onContextLoss 핸들러 등록** — 모바일 백그라운딩 / 장시간 hidden / 컨텍스트 한도 초과 모두에 대비.

## 8. 참고 자료

- [xtermjs/xterm.js#3029 — FitAddon and display 'none'](https://github.com/xtermjs/xterm.js/issues/3029) — 공식 입장
- [xtermjs/xterm.js#494 — viewport break when not displayed](https://github.com/xtermjs/xterm.js/issues/494) — viewport corruption 원조
- [xtermjs/xterm.js#4560 — getRasterizedGlyph when not displayed](https://github.com/xtermjs/xterm.js/issues/4560) — v5에서 재발
- [xtermjs/xterm.js#4379 — Support dozens of terminals](https://github.com/xtermjs/xterm.js/issues/4379) — WebGL 컨텍스트 한도 (Open)
- [xtermjs/xterm.js#880 — Performance: pause/resume rendering](https://github.com/xtermjs/xterm.js/issues/880) — IntersectionObserver 통합 미구현
- [xtermjs/xterm.js#3653 — Terminal breaks when returning by switching tabs](https://github.com/xtermjs/xterm.js/issues/3653) — 같은 증상 보고, 미해결
- [WebglAddon README — Handling Context Loss](https://github.com/xtermjs/xterm.js/blob/master/addons/addon-webgl/README.md) — 권장 패턴
- [microsoft/vscode#120393 — Improve handling of webgl context loss](https://github.com/microsoft/vscode/issues/120393) — VS Code 자동 fallback
- [microsoft/vscode#158595 — xterm loaded even when not visible](https://github.com/microsoft/vscode/issues/158595) — VS Code detach/attach 패턴
- [Apple Developer Forums #737042 — WebGL context lost on Safari iOS background](https://developer.apple.com/forums/thread/737042) — 모바일 컨텍스트 손실
