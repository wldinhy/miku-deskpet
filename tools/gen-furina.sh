#!/bin/bash
# 用法: gen-furina.sh <名字> "<动作描述>"   —— 生成「芙宁娜」皮肤立绘到 assets/skins/furina/<名字>.png
#   造型和画风以用户提供的参考图 assets/src/furina/user_ref.jpg 为准（魔法少女偶像风，不随仓库分发）；
#   头身比参考「即刻轮回」皮肤（Q 版 3.5 头身）。可用 BG 环境变量覆盖背景要求，REF_IDLE 指定作统一参考的正面图
source ~/.nvm/nvm.sh >/dev/null 2>&1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="$1"; POSE="$2"
OUT="$ROOT/assets/skins/furina"
REF="$ROOT/assets/src/furina"
mkdir -p "$OUT"
LOOK="long wavy white hair reaching her hips with soft light-blue streaks, a big curly ahoge, two small gold star hairpins in her bangs, one side lock swept over her right eye; big sparkling blue eyes with star-shaped highlights, rosy blush, small blue drop earrings
Hat: a small navy-blue top hat tilted on her head with a small gold crown ornament on top, a white band, and a large white-and-blue ribbon bow with a blue water-drop gem on the side
Outfit (exactly as in Image 1): a short navy-blue bolero jacket over a white blouse with frilled short puffy sleeves, a large blue-and-white striped bow on the chest with a blue diamond gem, a navy-blue bow at the waist, a fluffy layered magical-girl skirt in white, light blue and navy with frilly white petticoat edges, tiny star and diamond motifs, long blue-and-white striped ribbon streamers hanging behind, white gloves with frilled cuffs, a blue garter on her left thigh with a blue water-drop gem, white thigh-high stockings, navy-blue Mary-Jane shoes with small white bows"
WAND="her scepter: a white-and-gold staff topped with a glossy blue heart-shaped orb wearing a tiny gold crown, decorated with a blue bow and a blue water-drop gem"
EXTRA=(); EXTRA_DESC=""
REF_IDLE="${REF_IDLE:-$OUT/idle.png}"
if [ "$NAME" != "idle" ] && [[ "$NAME" != idle_* ]] && [ -f "$REF_IDLE" ]; then EXTRA=(-i "$REF_IDLE"); EXTRA_DESC=" Image 3 = the already-finished front sprite of Furina in this exact set: keep her face, hair, hat, outfit details, proportions, line weight and coloring identical to it."; fi
cd "$OUT"
PROMPT="Use the imagegen skill with the built-in image_gen tool (not the CLI).
Use case: illustration-story (game sprite)
Asset type: desktop pet character sprite, transparent PNG
Input images: Image 1 = the target design AND art style: a cute magical-idol version of Furina from Genshin Impact (match her hair, face, hat, outfit, scepter, colors and the art style exactly: pastel light blue and white, bold periwinkle-blue outlines, flat colors, sparkly eyes); Image 2 = proportion reference only — a chibi sprite of a DIFFERENT character from the same desktop-pet app: copy only its chibi body proportions (about 3.5 heads tall, big head, short soft legs), NOT its design or colors.${EXTRA_DESC}
Subject: a chibi Furina — ${LOOK}. ${WAND}.
Pose / expression: ${POSE}
Style/medium: identical to Image 1 — cute flat pop anime illustration, clean bold outlines in periwinkle / deep blue, flat pastel colors (white, baby blue, sky blue, navy accents, small gold accents), minimal cel shading, glossy sparkly eyes, very cute, airy and light. Chibi proportions about 3.5 heads tall with a big head and short soft legs, like Image 2.
Composition/framing: single character, full body including the whole hat, hair, ribbons and both feet, centered, character fills most of the frame height, portrait canvas, no cropping.
Background: ${BG:-fully transparent background (real alpha channel). No floor, no cast shadow, no scenery, no sparkles or bubbles floating around her, no text, no border, no glow outside the character.}
Avoid: text or letters anywhere, watermark, extra characters unless asked, realistic rendering, long thin legs, fan service, revealing angles, scary or distorted faces, heavy dark colors.
After generating, copy the final PNG into the current working directory as ${NAME}.png (overwrite allowed). Do not create any other files. Reply with just the saved path."
printf "%s" "$PROMPT" | codex exec --skip-git-repo-check -s workspace-write -C "$OUT" \
  -i "$REF/user_ref.jpg" -i "$ROOT/assets/skins/rinne/u_idle.png" "${EXTRA[@]}" > "/tmp/furina-${NAME}.log" 2>&1
echo "[$NAME] exit $? $(ls -la "${NAME}.png" 2>/dev/null | awk '{print $5}')"
