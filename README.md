items = {
    "リンゴ": {"price": 100, "tax": 0.10},
    "オレンジ": {"price": 150, "tax": 0.11}
}

# 'q' が入力されるまで何度も繰り返す
while True:
    item_name = input("商品名を入力してください（'q' で終了）: ")
    
    if item_name == 'q':
        print("処理を終了します。")
        break  # ループを抜けて終了
        
    # 商品が存在しない場合
    if item_name not in items:
        print("× その商品は登録されていません。再入力してください。\n")
        continue  # ループの先頭に戻る

    # 個数の入力
    count_input = input(f"{item_name}は何個買いますか？: ")
    
    # 数字かどうか判定（エラー対策）
    if not count_input.isdigit():
        print("× 個数は半角数字で入力してください。\n")
        continue

    count = int(count_input)
    data = items[item_name]
    
    # 税込単価 × 個数
    unit_price = int(data["price"] * (1 + data["tax"]))
    total = unit_price * count
    
    print(f"【計算結果】{item_name} × {count}個 ＝ {total}円です。\n")
