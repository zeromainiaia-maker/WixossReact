/**
 * 裏向きに置かれたカード（【トラップ】など）を「覗けるか」の判定。
 *
 * 🔴**なぜ純関数にするか**＝`battle_state` は**両者ぶんが1行で共有される**（相手の `signi_traps` も
 *   クライアントまで降りてくる）ので、**何を描かないかだけが裏向きを成立させている**。
 *   この判定を JSX に散らすと「片方の分岐だけ名前を描く」型の漏れが起き、**どの計器にも映らない**
 *   （JSON も engine も正しく、golden も smoke も緑のまま画面だけが喋る）。
 *   ⇒ 判定を1本にして golden から両方向を固定する（`§5.1 V-285`）。
 *
 * 🔑**相手側では `cardNum` を返さない**＝呼び出し側が「返ってきた値を使わない」規律に頼らない形にする。
 *   値が無ければ `alt` / `title` / `data-*` のような経路でも漏らしようがない。
 */
export type FacedownPeek =
  | { canPeek: false }
  | { canPeek: true; cardNum: string };

export function facedownPeek(cardNum: string | null | undefined, isMe: boolean): FacedownPeek {
  if (!cardNum || !isMe) return { canPeek: false };
  return { canPeek: true, cardNum };
}
