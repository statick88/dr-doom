import { truncateToWidth } from "@earendil-works/pi-tui";

function headerText(width) {
  return truncateToWidth("DR. DOOM · Controlled local harness", Math.max(0, width));
}

export function createDoomUi() {
  return function (pi) {
    pi.on("session_start", async (_event, ctx) => {
      if (ctx.mode !== "tui") return;
      ctx.ui.setHeader((_tui, theme) => ({
        render(width) {
          return [theme.fg("accent", headerText(width))];
        },
        invalidate() {},
      }));
    });
  };
}

export default createDoomUi();
