#!/bin/bash
# 用法: gen-batch.sh <起始行> <步长>   —— 依次生成 poses.txt 中第 起始行, 起始行+步长 … 的立绘
cd "$(dirname "$0")"
i=0
while IFS='|' read -r name pose; do
  if [ -n "$name" ] && [ $(( i % $2 )) -eq $1 ]; then bash ./gen.sh "$name" "$pose"; fi
  i=$((i+1))
done < "${3:-poses.txt}"
