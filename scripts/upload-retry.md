# 画像アップロード失敗リスト（再実行待ち）

作成日: 2026-05-23

## Sheet2〜10+TK 失敗分（38枚）

```
WX12-CB02
WX15-067
WX15-070
WX15-094
WX15-096
WX17-040
WX17-044
WX18-074
WX19-004
WX20-033
WX20-034-CB
WX20-041-CB
WX20-039-CB
WX20-044-CB
WX20-042-CB
WX20-047-CB
WX21-033-CB
WX21-031-CB
WD06-018
WXK02-030
WD09-018
WD13-015
WD15-002
WD15-006
WD15-011
WD15-015
WD15-013
WD15-017
WD15-016
WD15-018
WD15-020
WD15-019
WD15-023-E
SP01-003
SP23-013
SP32-013
PR-248
PR-274
```

## Sheet1 失敗分

Sheet1のログが残っていないため不明。再実行時は `upload-card-images.mjs` を
`upsert: true` のまま実行すれば、成功済みは上書き・失敗分のみ追加される。

## 再実行方法

```bash
# Sheet1の失敗分を含む全体を再実行する場合
node scripts/upload-card-images.mjs       # Sheet1
node scripts/upload-card-images-all.mjs   # Sheet2〜10+TK
```

失敗の主な原因: `ERR_TOO_MANY_REDIRECTS`（タカラトミーサイトのホットリンク制限）
時間帯を変えると成功する場合がある。
