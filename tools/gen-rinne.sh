#!/bin/bash
# 用法: gen-rinne.sh <名字> <u|m> "<动作描述>"   —— 生成「即刻轮回」皮肤立绘到 assets/skins/rinne/<名字>.png
#   u = 制服形态, m = 魔法少女形态；可用 BG 环境变量覆盖背景要求
source ~/.nvm/nvm.sh >/dev/null 2>&1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="$1"; FORM="$2"; POSE="$3"
OUT="$ROOT/assets/skins/rinne"
REF="$ROOT/assets/src/rinne"
mkdir -p "$OUT"
HAIR="pastel light-cyan hair in very long twin tails tied with long pink-and-white striped ribbons, a pink-and-white striped bow with a small yellow star on her head, a pink-and-white striped headband, big eyes with yellow star-shaped highlights in the pupils"
if [ "$FORM" = "m" ]; then
  OUTFIT="the magical girl outfit from Image 1: pink dress with puffy short sleeves and white frilled cuffs, white frilled collar, a large pink-and-white striped bow on the chest with a yellow star in the center, pink skirt with white layered frilly petticoat, two small yellow buttons, white gloves, white short boots with tiny wing shapes, long pink-and-white striped ribbon streamers flowing behind her; she carries a magic wand: a pink staff with a big pale-yellow star and a small white cloud-shaped wing at its top"
else
  OUTFIT="a cute everyday Japanese school uniform designed to match the same palette: white sailor-collar blouse whose pale-pink collar has white stripes, a pink-and-white striped neckerchief bow with a small yellow star clip, short pink pleated skirt, white thigh-high socks, pink loafers (no wand, no gloves)"
fi
# 参考图：官方 MV 封面与自动截帧（不随仓库分发，缺失时自动下载）
mkdir -p "$REF"
[ -f "$REF/cover.jpg" ] || curl -s -o "$REF/cover.jpg" https://i.ytimg.com/vi/3iUgKH8c7p4/maxresdefault.jpg
for i in 1 2; do [ -f "$REF/hq$i.jpg" ] || curl -s -o "$REF/hq$i.jpg" "https://i.ytimg.com/vi/3iUgKH8c7p4/hq$i.jpg"; done
cd "$OUT"
PROMPT="Use the imagegen skill with the built-in image_gen tool (not the CLI).
Use case: illustration-story (game sprite)
Asset type: desktop pet character sprite, transparent PNG
Input images: Image 1 = official key visual of this character design (match hair, face, colors and art style exactly); Images 2-3 = more frames of the same design and style.
Subject: a chibi Hatsune Miku in the design from Image 1 — ${HAIR}. Outfit: ${OUTFIT}.
Pose / expression: ${POSE}
Style/medium: identical to Image 1 — flat pop anime illustration, clean bold outlines in dark purple-navy, flat bright pastel colors (pink, white, light cyan, pale yellow), minimal cel shading, cute and energetic. Chibi proportions about 3.5 heads tall.
Composition/framing: single character, full body including both twin tails and both feet, centered, character fills most of the frame height, portrait canvas, no cropping.
Background: ${BG:-fully transparent background (real alpha channel). No floor, no cast shadow, no scenery, no text, no border, no glow outside the character.}
Avoid: weapons other than the star wand, blood, dark or horror elements, text, watermark, extra characters, realistic rendering.
After generating, copy the final PNG into the current working directory as ${NAME}.png (overwrite allowed). Do not create any other files. Reply with just the saved path."
printf "%s" "$PROMPT" | codex exec --skip-git-repo-check -s workspace-write -C "$OUT" \
  -i "$REF/cover.jpg" -i "$REF/hq1.jpg" -i "$REF/hq2.jpg" > "/tmp/rinne-${NAME}.log" 2>&1
echo "[$NAME] exit $? $(ls -la "${NAME}.png" 2>/dev/null | awk '{print $5}')"
