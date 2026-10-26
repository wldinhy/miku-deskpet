#!/bin/bash
# 用法: gen.sh <名字> "<动作描述>"   —— 调用 Codex 内置 image_gen 生成透明背景立绘到 assets/gen/<名字>.png
source ~/.nvm/nvm.sh >/dev/null 2>&1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="$1"; POSE="$2"
cd "$ROOT/assets/gen"
PROMPT="Use the imagegen skill with the built-in image_gen tool (not the CLI).
Use case: illustration-story (game sprite)
Asset type: desktop pet character sprite, transparent PNG
Input images: Image 1 = character turnaround sheet (THE style + design reference, match it exactly); Image 2 = second reference for the same character and art style.
Subject: the exact same chibi girl from Image 1 (Hatsune Miku style: very long teal twin tails, black/pink rectangular hair ornaments, grey sleeveless shirt with teal tie, black detached sleeves with teal trim, black pleated skirt with teal hem, black thigh-high socks with teal bands, black shoes with teal soles).
Pose / expression: ${POSE}
Style/medium: identical to Image 1 — soft, faded, muted watercolor-like anime illustration, gentle desaturated teal, light paper-grain texture, thin soft linework, low contrast, pastel. Same chibi proportions (~3.5 heads tall) as Image 1.
Composition/framing: single character, full body including the complete twin tails and both feet, centered, character fills most of the frame height, portrait canvas, no cropping.
Background: ${BG:-fully transparent background (real alpha channel). No floor, no cast shadow, no scenery, no text, no border.}
Avoid: different outfit, saturated or glossy colors, thick outlines, extra characters, watermark, text.
After generating, copy the final PNG into the current working directory as ${NAME}.png (overwrite allowed). Do not create any other files. Reply with just the saved path."
printf "%s" "$PROMPT" | codex exec --skip-git-repo-check -s workspace-write -C "$ROOT/assets/gen" \
  -i "$ROOT/assets/src/sheet.jpg" -i "$ROOT/assets/src/moon.jpg" > "$ROOT/assets/gen/${NAME}.log" 2>&1
echo "[$NAME] exit $? $(ls -la ${NAME}.png 2>/dev/null)"
