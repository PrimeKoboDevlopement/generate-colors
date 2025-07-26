#!/usr/bin/env node

const chroma = require('chroma-js'); // 色操作ライブラリchroma.jsをインポート
const fs = require('fs');             // ファイルシステム操作モジュールをインポート
const path = require('path');           // パス操作モジュールをインポート
const readline = require('readline');   // ユーザーからの入力を受け付けるためのモジュールをインポート

/**
 * WCAG AA 基準の最小コントラスト比を定義します。
 * 通常のテキストには 4.5:1、大きなテキスト（18pt以上、またはbold 14pt以上）には 3:1 が必要です。
 * このスクリプトでは、単純化のため4.5:1を主な基準として使用します。
 */
const MIN_CONTRAST_RATIO_AA = 4.5;

/**
 * 指定された背景色に対し、WCAG AA基準を満たす最適なテキスト色（白または黒）を決定します。
 * コントラスト比も計算して返します。
 * @param {string} backgroundColor - 背景色 (HEX, RGB, HSLなどchroma.jsで認識できる形式)
 * @returns {object} { textColor: string, contrastRatio: number, bestContrastIsWhite: boolean }
 */
function getAccessibleTextColor(backgroundColor) {
    const bgChroma = chroma(backgroundColor); // 背景色をchroma.jsオブジェクトに変換
    const whiteContrast = chroma.contrast(bgChroma, 'white'); // 白テキストとのコントラスト比を計算
    const blackContrast = chroma.contrast(bgChroma, 'black'); // 黒テキストとのコントラスト比を計算

    let textColor = '#ffffff'; // デフォルトのテキスト色を白に設定
    let contrastRatio = whiteContrast; // デフォルトのコントラスト比を白との比に設定
    let bestContrastIsWhite = true; // 白テキストが最適かどうかのフラグ

    // 白テキストとのコントラストがAA基準を満たすかチェック
    if (whiteContrast >= MIN_CONTRAST_RATIO_AA) {
        textColor = '#ffffff';
        contrastRatio = whiteContrast;
        bestContrastIsWhite = true;
    }
    // 白がダメで、黒テキストとのコントラストがAA基準を満たすかチェック
    else if (blackContrast >= MIN_CONTRAST_RATIO_AA) {
        textColor = '#000000';
        contrastRatio = blackContrast;
        bestContrastIsWhite = false;
    }
    // どちらもAA基準を満たさない場合、よりコントラストが高い方を選択（警告は別途行う）
    else {
        if (whiteContrast > blackContrast) {
            textColor = '#ffffff';
            contrastRatio = whiteContrast;
            bestContrastIsWhite = true;
        } else {
            textColor = '#000000';
            contrastRatio = blackContrast;
            bestContrastIsWhite = false;
        }
    }
    return { textColor, contrastRatio, bestContrastIsWhite };
}

/**
 * 基準となるブランドカラーのアクセシビリティをチェックし、
 * 必要に応じてWCAG AA基準を満たす代替色を提示し、ユーザーに選択させます。
 * @param {string} initialColor - ユーザーが初期に決定したブランドカラーのHEX値
 * @returns {Promise<string>} 最終的に使用するブランドカラーのHEX値（ユーザーが選択したもの、または元の色）
 */
async function selectBrandColor(initialColor) {
    // readlineインターフェースを作成し、ユーザーからの入力を受け付ける準備
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    /**
     * 指定された色の白と黒に対するコントラスト比とWCAG AA基準の適合性をチェックするヘルパー関数
     * @param {string} color - チェックする色
     * @returns {object} 白と黒それぞれのコントラスト情報
     */
    const checkContrast = (color) => {
        const whiteContrast = chroma.contrast(color, 'white');
        const blackContrast = chroma.contrast(color, 'black');
        return {
            withWhite: { ratio: whiteContrast, meetsAA: whiteContrast >= MIN_CONTRAST_RATIO_AA },
            withBlack: { ratio: blackContrast, meetsAA: blackContrast >= MIN_CONTRAST_RATIO_AA }
        };
    };

    let currentBrandColor = initialColor; // 現在のブランドカラーとして初期値を設定
    let contrastInfo = checkContrast(currentBrandColor); // 現在のブランドカラーのコントラスト情報を取得

    // 初期ブランドカラーのコントラストチェック結果をCLIに表示
    console.log(`\n--- 初期ブランドカラーのアクセシビリティチェック ---`);
    console.log(`あなたの入力したブランドカラー: ${currentBrandColor}`);
    console.log(`  白テキストとのコントラスト: ${contrastInfo.withWhite.ratio.toFixed(2)}:1 (AA基準適合: ${contrastInfo.withWhite.meetsAA ? 'はい' : 'いいえ'})`);
    console.log(`  黒テキストとのコントラスト: ${contrastInfo.withBlack.ratio.toFixed(2)}:1 (AA基準適合: ${contrastInfo.withBlack.meetsAA ? 'はい' : 'いいえ'})`);

    // 白または黒のどちらかのテキストに対してAA基準を満たしている場合
    if (contrastInfo.withWhite.meetsAA || contrastInfo.withBlack.meetsAA) {
        console.log(`良いニュース！あなたのブランドカラー '${currentBrandColor}' は、白または黒のテキストに対してWCAG AAコントラスト基準を満たしています。`);
        rl.close(); // readlineインターフェースを閉じる
        return currentBrandColor; // この色をそのまま使用
    }
    // どちらのテキストに対してもAA基準を満たさない場合
    else {
        console.warn(`\n!!! 警告: あなたのブランドカラー '${currentBrandColor}' は、白または黒のテキストのどちらに対してもWCAG AAコントラスト基準を満たしていません。!!!`);
        console.warn(`アクセシビリティ向上のため、代替案の使用を強くお勧めします。`);

        // 代替案の生成
        const alternatives = []; // 代替色のリスト
        // 元の色のL*a*b*色空間のL値（知覚的な明度）を取得
        const baseLabL = chroma(currentBrandColor).lab()[0];

        // 白テキストと十分なコントラストを持つように明度を上げて候補を探す
        // L値は0から100の範囲。元のL値から最大95まで1ずつ増やして探索。
        for (let l = Math.min(baseLabL, 95); l <= 95; l += 1) {
            const candidate = chroma(currentBrandColor).set('lab.l', l); // L値を調整した新しい色
            const contrast = getAccessibleTextColor(candidate.hex()); // その色のコントラスト情報を取得
            if (contrast.contrastRatio >= MIN_CONTRAST_RATIO_AA) {
                // AA基準を満たしていれば代替案として追加
                alternatives.push({
                    color: candidate.hex(),
                    contrast: contrast.contrastRatio,
                    textColor: contrast.textColor
                });
                if (alternatives.length >= 3) break; // 3つ見つけたら次の探索へ移行 (効率化)
            }
        }

        // 黒テキストと十分なコントラストを持つように明度を下げて候補を探す
        // L値は5から元のL値-1まで1ずつ減らして探索。
        for (let l = Math.max(baseLabL - 1, 5); l >= 5; l -= 1) {
             const candidate = chroma(currentBrandColor).set('lab.l', l); // L値を調整した新しい色
            const contrast = getAccessibleTextColor(candidate.hex()); // その色のコントラスト情報を取得
            // 既に生成された代替案に同じ色がないかチェック（重複回避）
            if (contrast.contrastRatio >= MIN_CONTRAST_RATIO_AA && !alternatives.some(alt => alt.color === candidate.hex())) {
                alternatives.push({
                    color: candidate.hex(),
                    contrast: contrast.contrastRatio,
                    textColor: contrast.textColor
                });
                if (alternatives.length >= 6) break; // 合計で6つ見つけたら探索終了 (効率化)
            }
        }

        // 重複を除去し、元の色にL値が近い順にソート（知覚的類似性を優先）
        // これにより、元のブランドイメージを大きく損なわずにアクセシビリティを確保できる候補が提示される
        alternatives.sort((a, b) => {
            const diffA = Math.abs(chroma(a.color).lab()[0] - baseLabL);
            const diffB = Math.abs(chroma(b.color).lab()[0] - baseLabL);
            return diffA - diffB;
        });

        console.log(`\n以下は、WCAG AA基準を満たす（推奨テキスト色とのコントラスト）代替カラーです:`);
        // 提示された代替案をCLIに表示
        alternatives.forEach((alt, index) => {
            console.log(`  ${index + 1}. ${alt.color} (テキスト色: ${alt.textColor}, コントラスト: ${alt.contrast.toFixed(2)}:1)`);
        });

        // デフォルトの選択肢を設定（最初の代替案があれば1、なければ0）
        const defaultOption = alternatives.length > 0 ? 1 : null;

        // ユーザーからの選択を待つPromiseを返す
        return new Promise((resolve) => {
            rl.question(`\n使用したい代替カラーの番号を入力してください（元の'${currentBrandColor}'を使用する場合は0）: [${defaultOption || 0}] `, (answer) => {
                const choice = parseInt(answer || defaultOption, 10); // ユーザーの入力またはデフォルト値を取得
                if (choice > 0 && choice <= alternatives.length) {
                    const selectedColor = alternatives[choice - 1].color; // 選択された代替色
                    console.log(`選択されたブランドカラーを使用します: ${selectedColor}`);
                    rl.close(); // readlineインターフェースを閉じる
                    resolve(selectedColor); // 選択された色を解決
                } else {
                    console.log(`元のブランドカラーを使用します: ${currentBrandColor}`);
                    rl.close(); // readlineインターフェースを閉じる
                    resolve(currentBrandColor); // 元の色を解決
                }
            });
        });
    }
}

/**
 * 最終的に決定されたブランドカラーを基準に、他のBootstrapテーマカラーを派生させ、
 * アクセシビリティを考慮したSCSS変数（_variables.scss形式）の文字列を生成します。
 * @param {string} brandPrimaryColor - 基準となるブランドカラー (HEX形式)
 * @returns {string} Bootstrapの_variables.scss形式のSCSS文字列
 */
function generateBootstrapColors(brandPrimaryColor) {
    const baseColor = chroma(brandPrimaryColor); // 基準となるブランドカラーをchroma.jsオブジェクトに変換
    const generatedColors = {}; // 生成される全ての色のマップ
    const themeColors = {};     // Bootstrapの$theme-colorsマップ用の色

    // --- 基本となるテーマカラーの定義と派生 ---
    // ここでは、基準となるブランドカラーから色相（hue）、彩度（saturation）、明度（lightness）を調整して、
    // Bootstrapの標準的なカラーパレットに対応する色を生成します。
    // `baseColor.hsl()`で現在の色相を取得し、そこから相対的にずらすことで、
    // どのような色相のブランドカラーが入力されても対応できるようにしています。
    const baseHue = baseColor.hsl()[0]; // 基準色の色相を取得 (0-360)

    // 注: Bootstrapの$blueをPrimaryと見立ててますが、変数名は入力された色に合わせるのが自然です。
    // 便宜上$blueのままにしていますが、必要であれば$primaryなどに変更してください。
    generatedColors.$blue = baseColor.hex(); // 基準のブランドカラーを$blueとして扱う

    // HSLの色相（hue）は0-360度で表現され、色の種類を示します。
    // chroma.jsの.set('hsl.h', value) は、valueが指定された新しい色相になります。
    // 相対的にずらすには、(baseHue + degreeOffset) % 360 のように計算します。
    // .darken() や .saturate() で明度や彩度を調整し、色の見栄えを整えます。

    // 例：$blueの色相を0度とした場合、以下はBootstrapのデフォルトカラーパレットの一般的な色相配置を参考にしています。
    // 例えば、-30度で紫、+120度で緑、+180度で赤やシアンといった補色系を表現します。
    generatedColors.$indigo = chroma.hsl((baseHue - 30 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).darken(0.3).saturate(0.1).hex();
    generatedColors.$purple = chroma.hsl((baseHue - 60 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).darken(0.5).saturate(0.2).hex();
    generatedColors.$pink = chroma.hsl((baseHue + 150 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).brighten(0.5).saturate(0.2).hex();
    generatedColors.$red = chroma.hsl((baseHue + 180 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).darken(0.2).saturate(0.3).hex();
    generatedColors.$orange = chroma.hsl((baseHue + 90 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).brighten(0.3).saturate(0.4).hex();
    generatedColors.$yellow = chroma.hsl((baseHue + 60 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).brighten(0.8).saturate(0.5).hex();
    generatedColors.$green = chroma.hsl((baseHue + 120 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).darken(0.1).saturate(0.1).hex();
    generatedColors.$teal = chroma.hsl((baseHue + 165 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).darken(0.1).saturate(0.05).hex();
    generatedColors.$cyan = chroma.hsl((baseHue + 180 + 360) % 360, baseColor.hsl()[1], baseColor.hsl()[2]).brighten(0.1).saturate(0.05).hex();


    // グレースケールカラーの定義
    // 白を基準に明度を調整して灰色を生成します。
    generatedColors.$white = '#ffffff';
    generatedColors.$gray = chroma(generatedColors.$white).darken(2).hex(); // 適度な灰色
    generatedColors.$gray_dark = chroma(generatedColors.$white).darken(4).hex(); // より暗い灰色
    generatedColors.$black = '#000000';

    // --- Bootstrapの$theme-colorsマップの定義 ---
    // ここでBootstrapの主要なテーマカラー（primary, successなど）に、上記の生成された色を割り当てます。
    themeColors.primary = generatedColors.$blue; // 入力された色をプライマリカラーとする
    themeColors.secondary = generatedColors.$gray; // 二次色として灰色を使用
    themeColors.success = generatedColors.$green;
    themeColors.info = generatedColors.$cyan; // または $teal
    themeColors.warning = generatedColors.$yellow;
    themeColors.danger = generatedColors.$red;
    themeColors.light = generatedColors.$gray; // 明るい背景色として灰色を使用
    themeColors.dark = generatedColors.$gray_dark; // 暗い背景色として暗い灰色を使用

    // --- SCSS出力文字列の生成開始 ---
    let scssOutput = `// Generated by Bootstrap Color Generator (Node.js + chroma.js)\n\n`;

    // 個別色のSCSS変数として出力
    scssOutput += '// ブランドカラー (入力された色から派生)\n';
    for (const key in generatedColors) {
        if (generatedColors.hasOwnProperty(key)) {
            scssOutput += `${key}: ${generatedColors[key]};\n`;
        }
    }
    scssOutput += '\n';

    // $theme-colors SCSSマップとして出力
    scssOutput += '// テーマカラー\n';
    scssOutput += '$theme-colors: (\n';
    for (const key in themeColors) {
        if (themeColors.hasOwnProperty(key)) {
            scssOutput += `  "${key}": ${themeColors[key]},\n`;
        }
    }
    scssOutput += `);\n\n`;

    // $theme-color-contrast SCSSマップとして出力
    // 各テーマカラーの背景色に対応する最適なテキスト色（白または黒）を定義します。
    // これにより、Bootstrapのコンポーネントでアクセシブルなテキスト色が自動的に適用されるようになります。
    scssOutput += '// 各テーマカラーに対するテキスト色 (WCAG AAコントラスト基準に基づく)\n';
    scssOutput += '$theme-color-contrast:\n';
    scssOutput += '  "primary":        ' + getAccessibleTextColor(themeColors.primary).textColor + ',\n';
    scssOutput += '  "secondary":      ' + getAccessibleTextColor(themeColors.secondary).textColor + ',\n';
    scssOutput += '  "success":        ' + getAccessibleTextColor(themeColors.success).textColor + ',\n';
    scssOutput += '  "info":           ' + getAccessibleTextColor(themeColors.info).textColor + ',\n';
    scssOutput += '  "warning":        ' + getAccessibleTextColor(themeColors.warning).textColor + ',\n';
    scssOutput += '  "danger":         ' + getAccessibleTextColor(themeColors.danger).textColor + ',\n';
    scssOutput += '  "light":          ' + getAccessibleTextColor(themeColors.light).textColor + ',\n';
    scssOutput += '  "dark":           ' + getAccessibleTextColor(themeColors.dark).textColor + ',\n';
    scssOutput += ';\n\n';

    // その他のアクセシビリティ関連変数（テキストとリンクの色）
    // 通常の本文色やリンク色が、デフォルトの背景色（$body-bg、通常は白）に対して
    // 十分なコントラストを持つように調整します。
    const defaultBodyBg = '#ffffff'; // Bootstrapのデフォルトの$body-bgを仮定
    const bodyColorResult = getAccessibleTextColor(defaultBodyBg);
    // $body-bgが白の場合、テキストは黒に近い色に、そうでない場合は白に設定
    const bodyColor = bodyColorResult.textColor === '#000000' ? '#212529' : '#ffffff';
    const linkColor = themeColors.primary; // リンク色をプライマリカラーに設定
    const linkHoverColor = chroma(linkColor).darken(0.15).hex(); // ホバー時は少し暗くする

    scssOutput += '// 一般的なテキストとリンクの色 ($body-bgとのコントラストを確保)\n';
    scssOutput += `$body-color: ${bodyColor}; // $body-bgとの良好なコントラストを確保\n`;
    scssOutput += `$link-color: ${linkColor};\n`;
    scssOutput += `$link-hover-color: ${linkHoverColor};\n`;

    return scssOutput; // 生成されたSCSS文字列を返す
}

// --- メイン処理の実行 ---
async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // ユーザーにブランドカラーのHEX値を入力させるプロンプト
    // HEX値の簡易バリデーションも行う
    let brandColorInput = '';
    while (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(brandColorInput)) {
        brandColorInput = await new Promise(resolve => {
            rl.question('あなたのブランドカラー（HEX値、例: #007bff）を入力してください: ', answer => {
                resolve(answer.trim());
            });
        });
        if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(brandColorInput)) {
            console.error('無効なHEX値です。#RRGGBB または #RGB 形式で入力してください。');
        }
    }
    rl.close(); // 入力が終わったらreadlineインターフェースを閉じる

    // ユーザーが入力したブランドカラーを基準にアクセシビリティチェックと代替案提示を行う
    const finalBrandColor = await selectBrandColor(brandColorInput);
    // 最終的に決定されたブランドカラーを基準にBootstrapのカラー変数を生成
    const scssContent = generateBootstrapColors(finalBrandColor);

    // 生成されたSCSSコンテンツをファイルに保存
    const outputPath = path.join(__dirname, '_variables_generated.scss');
    fs.writeFileSync(outputPath, scssContent, 'utf8');

    console.log(`\n生成されたBootstrapカラーをファイルに保存しました: ${outputPath}`);
    console.log(`最終調整のために、生成されたカラーとコントラスト比をレビューしてください。`);
    console.log(`'${path.basename(outputPath)}' の内容を、あなたのプロジェクトの '_variables.scss' にコピーするか、インポートしてください。`);
}

// メイン関数を実行
main();