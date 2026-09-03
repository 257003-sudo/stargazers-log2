items = {
    "リンゴ": {"price": 100, "tax": 0.10},
    "オレンジ": {"price": 150, "tax": 0.11}
}

cart = []  # カート（複数の商品を溜めるリスト）

# 1. 商品をカートに入れるループ
while True:
    item_name = input("商品名を入力してください（'q' でお会計へ）: ")
    
    if item_name == 'q':
        break
        
    if item_name not in items:
        print("× その商品は登録されていません。\n")
        continue

    count_input = input(f"{item_name}は何個買いますか？: ")
    if not count_input.isdigit() or int(count_input) <= 0:
        print("× 1以上の数字を入力してください。\n")
        continue

    count = int(count_input)
    data = items[item_name]
    subtotal = int(data["price"] * (1 + data["tax"])) * count

    # カート（リスト）に辞書形式で追加
    cart.append({"name": item_name, "count": count, "subtotal": subtotal})
    print(f"-> {item_name} × {count}個をカートに追加しました。\n")

# 2. お会計とおつり計算
if not cart:
    print("カートは空です。終了します。")
else:
    # 総合計の計算
    grand_total = sum(item["subtotal"] for item in cart)
    
    # 簡易レシート表示
    print("\n========== お買い上げ明細 ==========")
    for item in cart:
        print(f"・{item['name']} × {item['count']}個 : {item['subtotal']}円")
    print("------------------------------------")
    print(f"合計（税込）: {grand_total}円")
    print("====================================\n")

    # お金が足りるまで繰り返すループ
    while True:
        pay_input = input("お預かり金額を入力してください: ")
        
        if not pay_input.isdigit():
            print("× 数字で入力してください。")
            continue
            
        payment = int(pay_input)
        
        if payment < grand_total:
            print(f"× {grand_total - payment}円 不足しています。")
        else:
            change = payment - grand_total
            print(f"\nお支払い: {payment}円")
            print(f"おつり  : {change}円")
            print("ありがとうございました！")
            break
