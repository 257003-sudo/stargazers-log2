import java.util.Random;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Random rand = new Random();
        Scanner sc = new Scanner(System.in);
        int answer = rand.nextInt(100) + 1;  // 1〜100
        System.out.println("数字を入力して");
        int ans =0;


        while (ans !=answer) {
            System.out.println("数字をにゅうりょくしてね");
            ans = sc.nextInt();

            if (ans == answer) {
                System.out.println("的あて成功！！");
            } else if (ans < answer) {
                System.out.println("もっと答えは大きいよ、");
            } else {
                System.out.println("もっとちいさいよ");
            }

        }
    }
}





