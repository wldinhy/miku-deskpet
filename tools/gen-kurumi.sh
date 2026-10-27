#!/bin/bash
# 用法: gen-kurumi.sh <名字> <d|c> "<动作描述>"   —— 生成「FX战士久留美」皮肤立绘到 assets/skins/kurumi/<名字>.png
#   d = 白色连衣裙（平时）, c = 连衣裙外披粉色开衫（深夜 / 居家）；可用 BG 环境变量覆盖背景要求
#   画风沿用「即刻轮回」皮肤：扁平明亮的流行动画风、粗描线、Q 版 3.5 头身
source ~/.nvm/nvm.sh >/dev/null 2>&1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="$1"; FORM="$2"; POSE="$3"
OUT="$ROOT/assets/skins/kurumi"
REF="$ROOT/assets/src/kurumi"
mkdir -p "$OUT" "$REF"
# 参考图：官方网站立绘与脸部特写（不随仓库分发，缺失时自动下载）
[ -f "$REF/main_kurumi.png" ] || curl -s -o "$REF/main_kurumi.png" https://fxkurumi-info.com/assets/img/character/main_kurumi.png
[ -f "$REF/face_kurumi.png" ] || curl -s -o "$REF/face_kurumi.png" https://fxkurumi-info.com/assets/img/character/face_kurumi.png
HAIR="bright pink bob-cut hair that is a little darker pink at the tips, slightly longer side locks framing the face, a small ahoge, one small white hairpin on the right side of her bangs, big glossy magenta-pink eyes with a sparkly highlight ring, rosy blush"
OUTFIT="the outfit from Image 1: a loose white short-sleeved dress with a rounded collar, a thin dark-red ribbon tied in a small bow at the collar, a thin dark-red ribbon belt under the chest, dark burgundy Mary-Jane shoes with ankle straps"
[ "$FORM" = "c" ] && OUTFIT="$OUTFIT, plus an oversized soft salmon-pink knitted cardigan worn open over the dress with long sleeves covering half her hands"
# 已有正面立绘时一起作参考，保证全套统一
EXTRA=(); EXTRA_DESC=""
if [ "$NAME" != "idle" ] && [ -f "$OUT/idle.png" ]; then EXTRA=(-i "$OUT/idle.png"); EXTRA_DESC=" Image 4 = the already-finished front sprite of Kurumi in this exact set: keep her face, proportions, line weight and coloring identical to it."; fi
cd "$OUT"
PROMPT="Use the imagegen skill with the built-in image_gen tool (not the CLI).
Use case: illustration-story (game sprite)
Asset type: desktop pet character sprite, transparent PNG
Input images: Image 1 = official full-body art of Fukuga Kurumi from the anime 'FX Fighter Kurumi-chan' (match her hair, face, eyes, outfit and colors); Image 2 = official face close-up of her; Image 3 = STYLE reference only — a sprite of a DIFFERENT character from the same desktop-pet app: copy its rendering style, line work and chibi proportions, but NOT its character design, hair, colors or clothes.${EXTRA_DESC}
Subject: a chibi Kurumi — ${HAIR}. Outfit: ${OUTFIT}.
Pose / expression: ${POSE}
Style/medium: identical to Image 3 — cute flat pop anime illustration, clean bold outlines in dark berry-purple, flat bright colors (bubblegum pink, white, dark red), minimal cel shading, glossy sparkly eyes, very cute, pretty and charming, never creepy or grotesque. Chibi proportions about 3.5 heads tall like Image 3.
Composition/framing: single character, full body including the whole hair and both feet, centered, character fills most of the frame height, portrait canvas, no cropping.
Background: ${BG:-fully transparent background (real alpha channel). No floor, no cast shadow, no scenery, no text, no border, no glow outside the character.}
Avoid: text or letters anywhere, watermark, extra characters, realistic rendering, fan service, revealing angles, scary or distorted faces.
After generating, copy the final PNG into the current working directory as ${NAME}.png (overwrite allowed). Do not create any other files. Reply with just the saved path."
printf "%s" "$PROMPT" | codex exec --skip-git-repo-check -s workspace-write -C "$OUT" \
  -i "$REF/main_kurumi.png" -i "$REF/face_kurumi.png" -i "$ROOT/assets/skins/rinne/u_idle.png" "${EXTRA[@]}" > "/tmp/kurumi-${NAME}.log" 2>&1
echo "[$NAME] exit $? $(ls -la "${NAME}.png" 2>/dev/null | awk '{print $5}')"
