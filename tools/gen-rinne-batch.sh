#!/bin/bash
# 用法: gen-rinne-batch.sh <起始行> <步长>   —— 依次生成 poses-rinne.txt 中对应行的立绘
cd "$(dirname "$0")"
i=0
while IFS='|' read -r name form pose; do
  if [ -n "$name" ] && [ $(( i % $2 )) -eq "$1" ]; then bash ./gen-rinne.sh "$name" "$form" "$pose"; fi
  i=$((i+1))
done < poses-rinne.txt
if [ "$1" = "0" ]; then
  BG="transparent background (real alpha channel) EXCEPT for one large pale-cream clock face with simple dark numerals and a soft glowing outline placed behind her upper body, plus a few small yellow stars around it. No sky, no city, no text, no border; everything else fully transparent." \
    bash ./gen-rinne.sh m_night m "floating in mid-air in front of the clock face, sitting sideways on her star wand like a broom, legs crossed, one hand waving, gentle smile, ribbon streamers and twin tails flowing"
fi
