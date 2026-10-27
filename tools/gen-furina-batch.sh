#!/bin/bash
# 用法: gen-furina-batch.sh <起始行> <步长>   —— 依次生成 poses-furina.txt 中对应行的立绘（已存在的跳过）
cd "$(dirname "$0")"
OUT="../assets/skins/furina"
i=0
while IFS='|' read -r name pose; do
  if [ -n "$name" ] && [ $(( i % $2 )) -eq "$1" ] && [ ! -f "$OUT/$name.png" ]; then bash ./gen-furina.sh "$name" "$pose"; fi
  i=$((i+1))
done < poses-furina.txt
if [ "$1" = "0" ] && [ ! -f "$OUT/night.png" ]; then
  BG="transparent background (real alpha channel) EXCEPT for one soft pale-gold spotlight cone shining down from above onto her, fading to full transparency at its edges, plus a few tiny sparkles. No stage, no curtains, no text, no border; everything else fully transparent." \
    bash ./gen-furina.sh night "after the curtain call: sitting alone on the floor in the spotlight hugging her knees, top hat resting beside her, the scepter leaning on her shoulder, looking up with a soft tired but content smile"
fi
