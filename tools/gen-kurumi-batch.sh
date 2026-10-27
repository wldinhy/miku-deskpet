#!/bin/bash
# 用法: gen-kurumi-batch.sh <起始行> <步长>   —— 依次生成 poses-kurumi.txt 中对应行的立绘（已存在的跳过）
cd "$(dirname "$0")"
OUT="../assets/skins/kurumi"
i=0
while IFS='|' read -r name form pose; do
  if [ -n "$name" ] && [ $(( i % $2 )) -eq "$1" ] && [ ! -f "$OUT/$name.png" ]; then bash ./gen-kurumi.sh "$name" "$form" "$pose"; fi
  i=$((i+1))
done < poses-kurumi.txt
if [ "$1" = "0" ] && [ ! -f "$OUT/night.png" ]; then
  BG="transparent background (real alpha channel) EXCEPT for a small open laptop on the floor in front of her whose screen faces her and casts a soft bluish light on her face. No room, no furniture, no text, no border; everything else fully transparent." \
    bash ./gen-kurumi.sh night c "late night chart watching: sitting on the floor hugging her knees in front of the laptop, wrapped in the pink cardigan, face lit by the screen, tired but obsessed eyes with faint dark circles, staring at the screen, a mug beside her"
fi
