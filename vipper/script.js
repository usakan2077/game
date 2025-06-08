document.addEventListener('DOMContentLoaded', () => {
    // 物理エンジンのモジュール
    const { Engine, Render, Runner, Bodies, World, Body, Events, Composite } = Matter;

    // キャンバスの設定
    const canvas = document.getElementById('game-canvas');
    let gameWidth;
    let gameHeight;

    // 物理エンジンの初期化
    const engine = Engine.create();
    const world = engine.world;
    engine.gravity.y = 0.8;

    let render; // renderをletで宣言

    // キャンバスとレンダラーのサイズを更新する関数
    function updateCanvasAndRendererSize() {
        const rect = canvas.getBoundingClientRect();
        gameWidth = rect.width;
        gameHeight = rect.height;

        canvas.width = gameWidth;
        canvas.height = gameHeight;

        if (render) {
            Render.stop(render); // 既存のレンダラーを停止
            render.canvas.remove(); // 既存のキャンバス要素を削除（Matter.jsが新しいキャンバスを作成するため）
        }

        render = Render.create({
            canvas: canvas,
            engine: engine,
            options: {
                width: gameWidth,
                height: gameHeight,
                wireframes: false,
                background: '#f8f8f8'
            }
        });
        Render.run(render);
        Runner.run(Runner.create(), engine); // Runnerもここで初期化・実行
        updateWalls(); // 壁の位置を更新
    }

    // ゲーム変数
    let score = 0;
    let gameOver = false;
    let currentFruit = null;
    let nextFruit = null;
    let isDropping = false;
    let dropPosition; // 初期化は後で行う
    let imagesLoaded = false;
    let particles = []; // パーティクルを管理する配列

    // フルーツの定義
    const fruits = [
        { name: 'cherry', radius: 15, color: '#F20000', points: 1, next: 'strawberry', displayName: 'ねじりん（ちぇりー）' },
        { name: 'strawberry', radius: 22, color: '#FF5555', points: 3, next: 'grape', displayName: 'けすじー' },
        { name: 'grape', radius: 30, color: '#8000D7', points: 6, next: 'orange', displayName: 'メッシ' },
        { name: 'orange', radius: 38, color: '#FFA500', points: 10, next: 'persimmon', displayName: 'ヨヨヨ' },
        { name: 'persimmon', radius: 45, color: '#FF8C00', points: 15, next: 'apple', displayName: '西陣' },
        { name: 'apple', radius: 52, color: '#E52D27', points: 21, next: 'pear', displayName: 'ニック' },
        { name: 'pear', radius: 60, color: '#C9CC3F', points: 28, next: 'peach', displayName: '吾郎' },
        { name: 'peach', radius: 68, color: '#FFB7A2', points: 36, next: 'pineapple', displayName: 'やすにゃ' },
        { name: 'pineapple', radius: 76, color: '#FFD700', points: 45, next: 'melon', displayName: 'まいまい' },
        { name: 'melon', radius: 85, color: '#32CD32', points: 55, next: 'watermelon', displayName: 'こっとんちゃん' },
        { name: 'watermelon', radius: 95, color: '#008000', points: 66, next: null, displayName: 'おおおちゃん' }
    ];

    // フルーツのスプライト画像
    const fruitSprites = {};

    // フルーツ画像の読み込み
    function loadFruitImages() {
        let loadedCount = 0;
        const totalImages = fruits.length;

        fruits.forEach(fruit => {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === totalImages) {
                    imagesLoaded = true;
                    console.log('すべての画像が読み込まれました');
                    createFruitLegend(); // オリジナルの凡例とモーダル用の凡例を両方作成
                    prepareNextFruit();
                }
            };
            img.onerror = () => {
                console.error(`画像の読み込みに失敗しました: ${fruit.name}`);
                loadedCount++;
                if (loadedCount === totalImages) {
                    imagesLoaded = true;
                    createFruitLegend();
                    prepareNextFruit();
                }
            };
            img.src = `images/${fruit.name}.png`;
            fruitSprites[fruit.name] = img;
        });
    }

    // 凡例の作成
    function createFruitLegend() {
        const legendContainer = document.getElementById('fruit-legend-container');
        const modalLegendContainer = document.getElementById('fruit-legend-container-modal');

        // 両方のコンテナをクリア
        legendContainer.innerHTML = '';
        modalLegendContainer.innerHTML = '';

        fruits.forEach((fruit, index) => {
            // 通常の凡例アイテムを作成
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            const fruitImg = document.createElement('img');
            fruitImg.className = 'legend-image';
            fruitImg.src = `images/${fruit.name}.png`;
            fruitImg.alt = fruit.displayName;
            const fruitName = document.createElement('div');
            fruitName.className = 'legend-name';
            fruitName.textContent = fruit.displayName;
            const points = document.createElement('div');
            points.className = 'legend-points';
            points.textContent = `${fruit.points}点`;
            legendItem.appendChild(fruitImg);
            legendItem.appendChild(fruitName);
            legendItem.appendChild(points);
            legendContainer.appendChild(legendItem);

            // モーダル用の凡例アイテムを作成 (複製)
            const modalLegendItem = legendItem.cloneNode(true);
            modalLegendContainer.appendChild(modalLegendItem);

            if (fruit.next) {
                const arrow = document.createElement('div');
                arrow.className = 'legend-arrow';
                arrow.textContent = '→';
                legendContainer.appendChild(arrow);
                modalLegendContainer.appendChild(arrow.cloneNode(true)); // モーダルにも矢印を追加
            }
        });
    }

    // 壁の作成 - 壁の厚さを増やし、確実に衝突するようにします
    // 壁の作成と更新
    let walls = []; // wallsをletで宣言
    function updateWalls() {
        // 既存の壁を削除
        World.remove(world, walls);

        const wallOptions = {
            isStatic: true,
            render: {
                fillStyle: '#FFCC99'
            },
            label: 'wall',
            restitution: 0.2,
            friction: 0.1
        };

        walls = [
            Bodies.rectangle(gameWidth / 2, gameHeight, gameWidth, 20, wallOptions), // Bottom wall
            Bodies.rectangle(gameWidth / 2, 0, gameWidth, 10, wallOptions), // Top wall (for game over check)
            Bodies.rectangle(0, gameHeight / 2, 10, gameHeight, wallOptions), // Left wall
            Bodies.rectangle(gameWidth, gameHeight / 2, 10, gameHeight, wallOptions) // Right wall
        ];
        World.add(world, walls);
    }

    // ラインの作成（落下ラインの可視化）
    const dropLine = {
        position: gameWidth / 2, // 初期値は仮
        draw: function() {
            const ctx = render.context;
            // ctx.beginPath();
            // ctx.moveTo(this.position, 0);
            // ctx.lineTo(this.position, 100);
            // ctx.strokeStyle = isDropping ? 'rgba(200, 200, 200, 0.3)' : 'rgba(0, 0, 0, 0.2)';
            // ctx.lineWidth = 2;
            // ctx.stroke();

            // 動物の画像を描画
            const animalImage = document.getElementById('animal-image');
            const animalWidth = 80; // 動物画像の幅
            const animalHeight = 80; // 動物画像の高さ
            ctx.drawImage(animalImage, this.position - animalWidth / 2, 20, animalWidth, animalHeight);

            // 現在のフルーツがあり、ドロップ中でない場合にプレビューを描画
            if (currentFruit && !isDropping) {
                const fruit = getFruitByName(currentFruit); // フルーツの定義を取得
                if (!fruit) return; // currentFruitが無効な名前だった場合の安全策

                const img = fruitSprites[currentFruit]; // 対応するHTMLImageElementを取得

                // 画像を描画する条件：
                // 1. 全画像の読み込み処理が完了している (imagesLoaded === true)
                // 2. 現在のフルーツに対応する画像オブジェクトが存在する (img)
                // 3. 画像オブジェクトが完全に読み込まれている (img.complete === true)
                // 4. 画像が壊れていない (img.naturalWidth !== 0)
                if (imagesLoaded && img && img.complete && img.naturalWidth !== 0) {
                    const size = fruit.radius * 2;
                    ctx.drawImage(
                        img,
                        this.position - fruit.radius,
                        80 - fruit.radius,
                        size,
                        size
                    );
                } else {
                    // フォールバック処理:
                    // 画像がまだ読み込まれていない、または特定の画像が見つからない/壊れている場合は色付きの円を描画
                    ctx.beginPath();
                    ctx.arc(this.position, 50, fruit.radius, 0, Math.PI * 2);
                    ctx.fillStyle = fruit.color;
                    ctx.fill();
                }
            }
        }
    };

    // 次のフルーツを準備
    function prepareNextFruit() {
        console.log('[prepareNextFruit] Called. Current nextFruit:', nextFruit);
        const smallFruits = ['cherry', 'strawberry', 'grape'];
        currentFruit = nextFruit || smallFruits[Math.floor(Math.random() * smallFruits.length)];
        nextFruit = smallFruits[Math.floor(Math.random() * smallFruits.length)];
        console.log('[prepareNextFruit] New currentFruit:', currentFruit, 'New nextFruit:', nextFruit);
        updateNextFruitDisplay();
    }

    // 次のフルーツの表示を更新
    function updateNextFruitDisplay() {
        const nextFruitElement = document.getElementById('next-fruit');
        const fruit = getFruitByName(nextFruit);

        if (imagesLoaded && fruitSprites[nextFruit]) {
            nextFruitElement.style.backgroundImage = `url(images/${nextFruit}.png)`;
            nextFruitElement.style.backgroundColor = 'transparent';
        } else {
            nextFruitElement.style.backgroundImage = 'none';
            nextFruitElement.style.backgroundColor = fruit.color;
        }
    }

    // フルーツを名前で取得
    function getFruitByName(name) {
        return fruits.find(fruit => fruit.name === name);
    }

    // フルーツをドロップ
    function dropFruit() {
        console.log('[dropFruit] Attempting to drop. isDropping:', isDropping, 'gameOver:', gameOver, 'currentFruit:', currentFruit);
        if (isDropping || gameOver) {
            console.log('[dropFruit] Drop blocked. isDropping:', isDropping, 'gameOver:', gameOver);
            return;
        }

        if (!currentFruit) {
            console.error('[dropFruit] Drop blocked because currentFruit is null or undefined.');
            prepareNextFruit(); // 念のため次のフルーツを準備しようと試みる
            return;
        }

        isDropping = true;
        console.log('[dropFruit] isDropping set to true.');
        const fruit = getFruitByName(currentFruit);
        
        if (!fruit) {
            console.error(`[dropFruit] Fruit data for "${currentFruit}" not found. Cannot drop.`);
            isDropping = false; // isDropping をリセット
            prepareNextFruit();
            return;
        }

        const img = fruitSprites[currentFruit]; // 画像オブジェクトを取得

        const useSprite = imagesLoaded && img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;

        const renderOptions = {
            fillStyle: fruit.color
        };

        if (useSprite) {
            renderOptions.sprite = {
                texture: `images/${currentFruit}.png`,
                xScale: (fruit.radius * 2) / img.naturalWidth,
                yScale: (fruit.radius * 2) / img.naturalHeight
            };
        }

        const fruitBody = Bodies.circle(
            dropPosition,
            50,
            fruit.radius,
            {
                restitution: 0.3,
                friction: 0.04,
                frictionAir: 0.001,
                density: 0.01,
                label: currentFruit,
                render: renderOptions // 条件に応じて構築されたrenderOptionsを使用
            }
        );

        World.add(world, fruitBody);
        console.log('[dropFruit] Fruit body added to world:', fruitBody.label);

        setTimeout(() => {
            isDropping = false;
            console.log('[dropFruit] setTimeout: isDropping set to false. Preparing next fruit.');
            prepareNextFruit();
        }, 500);
    }

    // パーティクルエフェクトを生成する関数
    function createParticleEffect(x, y, color) {
        const numParticles = 20; // 生成するパーティクルの数
        for (let i = 0; i < numParticles; i++) {
            const angle = Math.random() * Math.PI * 2; // 全方向
            const speed = Math.random() * 3 + 1; // 速度
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 3 + 1, // 初期サイズ
                color: color,
                alpha: 1, // 初期透明度
                life: 60 // 寿命（フレーム数）
            });
        }
    }

    // 衝突検出の処理を追加（修正版）
    Events.on(engine, 'collisionActive', (event) => {
        const pairs = event.pairs;
        const processedPairs = [];

        for (let i = 0; i < pairs.length; i++) {
            const bodyA = pairs[i].bodyA;
            const bodyB = pairs[i].bodyB;

            const pairId = `${bodyA.id}-${bodyB.id}`;
            if (processedPairs.includes(pairId)) continue;

            if (bodyA.label !== 'wall' && bodyB.label !== 'wall' &&
                bodyA.label === bodyB.label) {

                if (bodyA.isProcessing || bodyB.isProcessing) continue;

                const fruitName = bodyA.label;
                const fruit = getFruitByName(fruitName);

                if (fruit && fruit.next) {
                    bodyA.isProcessing = true;
                    bodyB.isProcessing = true;
                    processedPairs.push(pairId);

                    const position = {
                        x: (bodyA.position.x + bodyB.position.x) / 2,
                        y: (bodyA.position.y + bodyB.position.y) / 2
                    };

                    World.remove(world, bodyA);
                    World.remove(world, bodyB);

                    // パーティクルエフェクトを生成
                    createParticleEffect(position.x, position.y, fruit.color);

                    const nextFruitName = fruit.next;
                    const nextFruitData = getFruitByName(nextFruitName);

                    if (!nextFruitData) {
                        console.error(`次のフルーツ "${nextFruitName}" が見つかりません`);
                        continue;
                    }
                    const nextImg = fruitSprites[nextFruitData.name]; 
                    
                    const useSpriteForNext = imagesLoaded && nextImg && nextImg.complete && nextImg.naturalWidth > 0 && nextImg.naturalHeight > 0;

                    const renderOptionsNext = {
                        fillStyle: nextFruitData.color
                    };

                    if (useSpriteForNext) {
                        renderOptionsNext.sprite = {
                            texture: `images/${nextFruitData.name}.png`,
                            xScale: (nextFruitData.radius * 2) / nextImg.naturalWidth,
                            yScale: (nextFruitData.radius * 2) / nextImg.naturalHeight
                        };
                    }

                    const newFruitBody = Bodies.circle(
                        position.x,
                        position.y,
                        nextFruitData.radius,
                        {
                            restitution: 0.3,
                            friction: 0.04,
                            frictionAir: 0.001,
                            density: 0.01,
                            label: nextFruitData.name,
                            render: renderOptionsNext // 条件に応じて構築されたrenderOptionsNextを使用
                        }
                    );

                    World.add(world, newFruitBody);

                    // 新しいフルーツにバウンスエフェクトのフラグを設定
                    newFruitBody.isBouncing = true;
                    newFruitBody.bounceStartTime = engine.timing.timestamp; // アニメーション開始時間

                    score += fruit.points;
                    updateScore();
                }
            }
        }
    });

    Events.off(engine, 'collisionStart');

    Events.on(engine, 'collisionStart', (event) => {
        const pairs = event.pairs;

        for (let i = 0; i < pairs.length; i++) {
            const bodyA = pairs[i].bodyA;
            const bodyB = pairs[i].bodyB;

            if (bodyA.label !== 'wall' && bodyB.label !== 'wall' && bodyA.label === bodyB.label) {
                console.log(`衝突発生: ${bodyA.label}同士`);
            }
        }
    });

    // ゲームオーバーのチェック
    Events.on(engine, 'afterUpdate', () => {
        const ctx = render.context; // コンテキストを最初に取得

        // パーティクルの描画と更新
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 1 / p.life; // 寿命に応じて透明度を減少
            p.radius += 0.1; // 徐々に拡大

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            // HEXカラーをRGBに変換してrgba()で使用
            const r = parseInt(p.color.slice(1, 3), 16);
            const g = parseInt(p.color.slice(3, 5), 16);
            const b = parseInt(p.color.slice(5, 7), 16);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
            ctx.fill();

            if (p.alpha <= 0) {
                particles.splice(i, 1); // 寿命が尽きたパーティクルを削除
            }
        }

        if (gameOver) { // ゲームオーバーなら、テキスト描画のみ行い、他の更新はスキップする場合
            // 半透明のオーバーレイを描画
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, gameWidth, gameHeight);

            // 「GAME OVER」テキストを描画
            ctx.font = 'bold 40px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', gameWidth / 2, gameHeight / 2);
            return; // 他のロジック（フルーツの閾値チェックなど）は実行しない
        }

        // --- ゲームオーバー基準線の描画 ---
        const threshold = 100;
        ctx.beginPath();
        ctx.moveTo(0, threshold);
        ctx.lineTo(gameWidth, threshold);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)'; // 薄い赤色で線を描画
        ctx.lineWidth = 2;
        ctx.stroke();
        // --- 基準線の描画ここまで ---

        const bodies = Composite.allBodies(world);
        let isAnyFruitAboveThreshold = false;
        let fruitCount = 0;
        let highestFruitY = gameHeight; // 最も高いフルーツのY座標を記録

        for (let body of bodies) {
            if (body.label !== 'wall') {
                fruitCount++;
                if (body.position.y < highestFruitY) {
                    highestFruitY = body.position.y;
                }

                // バウンスエフェクトの更新
                if (body.isBouncing && body.render.sprite) {
                    const elapsedTime = engine.timing.timestamp - body.bounceStartTime;
                    const duration = 300; // アニメーションの持続時間 (ms)
                    const maxScaleFactor = 1.2; // 最大スケール倍率
                    const minScaleFactor = 0.8; // 最小スケール倍率 (縦方向の縮み)

                    if (elapsedTime < duration) {
                        const progress = elapsedTime / duration;
                        // 0 -> 1 -> 0 のカーブでスケールを変化させる
                        // 例: sin(PI * progress) を利用して滑らかなアニメーション
                        const scaleX = 1 + (maxScaleFactor - 1) * Math.sin(Math.PI * progress);
                        const scaleY = 1 - (1 - minScaleFactor) * Math.sin(Math.PI * progress);

                        // Matter.jsのボディの元のスケールを考慮
                        const originalXScale = (getFruitByName(body.label).radius * 2) / fruitSprites[body.label].naturalWidth;
                        const originalYScale = (getFruitByName(body.label).radius * 2) / fruitSprites[body.label].naturalHeight;

                        body.render.sprite.xScale = originalXScale * scaleX;
                        body.render.sprite.yScale = originalYScale * scaleY;
                    } else {
                        // アニメーション終了、元のスケールに戻す
                        const originalXScale = (getFruitByName(body.label).radius * 2) / fruitSprites[body.label].naturalWidth;
                        const originalYScale = (getFruitByName(body.label).radius * 2) / fruitSprites[body.label].naturalHeight;
                        body.render.sprite.xScale = originalXScale;
                        body.render.sprite.yScale = originalYScale;
                        body.isBouncing = false; // アニメーション終了フラグ
                    }
                }

                // --- 基準線を超えたフルーツの強調表示 ---
                if (body.position.y < threshold && !isDropping) {
                    // フルーツの実際の位置に警告マーカーを描画
                    ctx.beginPath();
                    ctx.arc(body.position.x, body.position.y, body.circleRadius + 5, 0, Math.PI * 2); // フルーツより少し大きい円
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // 半透明の赤
                    ctx.fill();

                    if (!body.timeAboveThreshold) {
                        body.timeAboveThreshold = 1;
                    } else {
                        body.timeAboveThreshold++;
                        if (body.timeAboveThreshold > 60) { // 約1秒間閾値を超えていたら
                            console.log('[gameOverCheck] Fruit above threshold for too long:', body.label, 'Y:', body.position.y, 'Time:', body.timeAboveThreshold);
                            isAnyFruitAboveThreshold = true;
                            // isAnyFruitAboveThresholdがtrueになったらループを抜ける必要はない（全ての警告マーカーを描画するため）
                            // break; // ここでbreakすると、他の超えているフルーツの警告が描画されない
                        }
                    }
                } else if (body.position.y >= threshold) {
                    body.timeAboveThreshold = 0;
                }
                // --- 強調表示ここまで ---
            }
        }

        if (isAnyFruitAboveThreshold && !gameOver) { // isAnyFruitAboveThreshold のチェックはループ後に行う
            console.log('[gameOverCheck] Game Over triggered. Score:', score, 'Highest fruit Y:', highestFruitY, 'Fruit count:', fruitCount);
            gameOver = true;
            document.getElementById('game-over').classList.remove('hidden');
            document.getElementById('final-score').textContent = score;
        }

        dropLine.draw();
    });

    // スコア更新
    function updateScore() {
        document.getElementById('score').textContent = score;
    }

    // ゲームリセット
    function resetGame() {
        const bodies = Composite.allBodies(world);
        for (let body of bodies) {
            if (body.label !== 'wall') {
                World.remove(world, body);
            }
        }

        score = 0;
        gameOver = false;
        isDropping = false;
        nextFruit = null;

        updateScore();
        prepareNextFruit();

        const gameOverElement = document.getElementById('game-over');
        gameOverElement.style.display = 'none';
        gameOverElement.classList.add('hidden');
    }

    // イベントリスナー
    document.addEventListener('mousemove', (event) => {
        if (isDropping || gameOver) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;

        dropPosition = Math.max(30, Math.min(gameWidth - 30, mouseX));
        dropLine.position = dropPosition;
    });

    document.addEventListener('touchmove', (event) => {
        if (isDropping || gameOver) return;

        const rect = canvas.getBoundingClientRect();
        const touchX = event.touches[0].clientX - rect.left;

        dropPosition = Math.max(30, Math.min(gameWidth - 30, touchX));
        dropLine.position = dropPosition;

        event.preventDefault();
    }, { passive: false });

    document.addEventListener('click', () => {
        console.log('[Event] Click detected. gameOver:', gameOver);
        if (!gameOver) dropFruit();
    });

    document.addEventListener('touchend', () => {
        console.log('[Event] Touchend detected. gameOver:', gameOver);
        if (!gameOver) dropFruit();
    });

    document.getElementById('restart-button').addEventListener('click', resetGame);
    document.getElementById('play-again').addEventListener('click', resetGame);
    document.getElementById('restart-button-desktop').addEventListener('click', resetGame);

    // モーダル関連のイベントリスナー
    const legendToggleButton = document.getElementById('legend-toggle-button');
    const legendModal = document.getElementById('legend-modal');
    const closeLegendModalButton = document.getElementById('close-legend-modal');

    if (legendToggleButton) {
        legendToggleButton.addEventListener('click', () => {
            legendModal.style.display = 'flex'; // モーダルを表示
        });
    }

    if (closeLegendModalButton) {
        closeLegendModalButton.addEventListener('click', () => {
            legendModal.style.display = 'none'; // モーダルを非表示
        });
    }

    // モーダルの外側をクリックで閉じる
    window.addEventListener('click', (event) => {
        if (event.target === legendModal) {
            legendModal.style.display = 'none'; // モーダルを非表示
        }
    });

    document.getElementById('game-over').style.display = 'none';
    
    // 初期化処理
    updateCanvasAndRendererSize(); // 初回ロード時にキャンバスサイズを設定
    dropPosition = gameWidth / 2; // gameWidthが設定された後に初期化
    dropLine.position = dropPosition; // dropLineの初期位置も設定
    loadFruitImages();
    resetGame();

    // ウィンドウリサイズ時の処理
    window.addEventListener('resize', () => {
        updateCanvasAndRendererSize();
        // ドロップラインの位置も再計算
        dropPosition = gameWidth / 2;
        dropLine.position = dropPosition;
    });

    // 背景画像を設定
    document.body.style.backgroundImage = "url('images/forest-background.jpg')";
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundAttachment = "fixed";

    // キャンバスの背景色を設定
    canvas.style.backgroundColor = '#ffeecc'; // 薄いグリーン
});
