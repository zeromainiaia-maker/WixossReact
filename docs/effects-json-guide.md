# effects_*.json 読み方ガイド

## ファイル構成

| ファイル | 内容 | 件数 |
|---|---|---|
| `effects_WX.json` | WX01〜WX22, WXEX | 1,903件 |
| `effects_WXDi.json` | WXDiシリーズ | 1,542件 |
| `effects_WX24_25.json` | WX24〜WX26 | 864件 |
| `effects_WXK.json` | WXK01〜WXK11 | 894件 |
| `effects_misc.json` | WD/WDK/PR/SP系 | 731件 |

```
{ "カードID": [ 効果定義, ... ], ... }
```

1枚のカードに複数の効果がある場合は配列に複数入る。

---

## 効果定義1件の骨格

```json
{
  "effectId":    "WX01-001-E1",
  "effectType":  "ACTIVATED",
  "timing":      ["MAIN"],
  "cost":        { ... },
  "action":      { ... },
  "duration":    "INSTANT",
  "mandatory":   false,
  "parseStatus": "AUTO"
}
```

| フィールド | 説明 |
|---|---|
| `effectId` | カードID + E番号（同カード複数効果時は E1, E2...） |
| `effectType` | 効果種別（下記参照） |
| `timing` | 発動タイミング（下記参照） |
| `cost` | 払うコスト |
| `action` | 実際に何をするか |
| `duration` | `INSTANT`=一瞬 / `UNTIL_END`=ターン終了まで |
| `mandatory` | `true`=強制発動 |
| `parseStatus` | `AUTO`=パーサー自動生成 / `MANUAL`=手書き |

---

## effectType（効果種別）

| 値 | カードテキスト | 説明 |
|---|---|---|
| `ACTIVATED` | 【起】 | コストを払って起動する能力 |
| `AUTO` | 【出】【自】 | 条件を満たすと自動発動する能力 |
| `CONTINUOUS` | 【常】 | 常時適用される能力 |
| `LIFE_BURST` | ライフバースト | ライフクロスがクラッシュされたとき発動 |

---

## timing（発動タイミング）

| 値 | 説明 |
|---|---|
| `MAIN` | メインフェイズ |
| `ON_PLAY` | 場に出たとき（【出】能力） |
| `ATTACK` | アタックフェイズ |
| `ON_BANISH` | バニッシュされたとき |

---

## cost（コスト）

```json
{ "energy": [{"color":"白","count":1}] }
```

| フィールド | 説明 |
|---|---|
| `energy` | エナコスト。`color`と`count`の配列 |
| `down_self` | `true` = 自分をダウン（横向き）にする |
| `handDiscardSigni` | 手札のシグニを捨てる。`color`で色指定 |
| `exceed` | エクシード消費数 |
| `discard` | 手札を捨てる枚数 |

colorの値: `"白"` `"赤"` `"青"` `"緑"` `"黒"` `"無"`

---

## action（アクション）

### 主なtype一覧

| type | 効果 |
|---|---|
| `BOUNCE` | シグニを手札に戻す |
| `BANISH` | シグニをバニッシュ |
| `SEARCH` | デッキから探す |
| `DRAW` | カードを引く |
| `DISCARD` | 手札を捨てる |
| `MILL` | デッキの上からトラッシュに置く |
| `POWER_MODIFY` | パワーを増減する |
| `MOVE_TO_ENERGY` | エナゾーンに置く |
| `ADD_TO_HAND` | 手札に加える |
| `REVEAL` | 公開する |
| `SHUFFLE_DECK` | デッキをシャッフル |
| `SEQUENCE` | 複数アクションを順番に実行（`steps`配列） |
| `CHOOSE` | 選択肢から1つ選ぶ（`options`配列） |
| `STUB` | 未実装（プレースホルダー） |

### 連鎖処理

```json
{
  "type": "SEARCH",
  "then": {
    "type": "SEQUENCE",
    "steps": [
      { "type": "REVEAL" },
      { "type": "ADD_TO_HAND", "owner": "self" }
    ]
  },
  "afterSearch": { "type": "SHUFFLE_DECK", "owner": "self" }
}
```

- `then` : このアクションの後に続けて実行
- `steps` : `SEQUENCE`内の順番に実行するアクション配列
- `afterSearch` : サーチ後の後処理（シャッフルなど）

---

## filter（対象の絞り込み）

```json
{
  "cardType":        "シグニ",
  "color":           "白",
  "level":           { "max": 3 },
  "excludeCardName": "忘得ぬ幻想　ヴァルキリー"
}
```

| フィールド | 説明 |
|---|---|
| `cardType` | `"シグニ"` / `"ルリグ"` / `"スペル"` |
| `color` | カードの色 |
| `level` | `{ "min": 1, "max": 3 }` など |
| `cardName` | この文字列を**含む**カード名（部分一致） |
| `cardNames` | いずれかの名前に一致（完全一致・複数指定） |
| `excludeCardName` | この名前を**除外**（完全一致）。「〜以外」に対応 |
| `owner` | `"self"` / `"opponent"` |
| `location` | `"field"` / `"hand"` / `"deck"` / `"trash"` |

---

## 実例: WX01-037（「以外」フィルターの例）

```json
{
  "effectId":   "WX01-037-E1",
  "effectType": "ACTIVATED",
  "timing":     ["MAIN"],
  "cost":       { "down_self": true },
  "action": {
    "type": "SEARCH",
    "from": { "location": "deck", "owner": "self" },
    "filter": {
      "cardType": "シグニ",
      "level":    { "max": 3 },
      "excludeCardName": "忘得ぬ幻想　ヴァルキリー"
    },
    "maxCount": 1,
    "then": {
      "type": "SEQUENCE",
      "steps": [
        { "type": "REVEAL" },
        { "type": "ADD_TO_HAND", "owner": "self" }
      ]
    },
    "afterSearch": { "type": "SHUFFLE_DECK", "owner": "self" }
  },
  "duration":    "INSTANT",
  "mandatory":   false,
  "parseStatus": "AUTO"
}
```

**読み方**: ダウンコストを払い、デッキから「ヴァルキリー以外」のレベル3以下シグニ1枚をサーチ→公開→手札に加え→シャッフル。
