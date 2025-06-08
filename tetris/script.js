// テトリスゲームのJavaScript
document.addEventListener('DOMContentLoaded', () => {
    // ゲームの設定
    const COLS = 10;
    const ROWS = 20;
    const BLOCK_SIZE = 20; // スマホ向けにブロックサイズを小さく
    const COLORS = [
        null,
        '#FF0D72', // I
        '#0DC2FF', // J
        '#0DFF72', // L
        '#F538FF', // O
        '#FF8E0D', // S
        '#FFE138', // T
        '#3877FF'  // Z
    ];

    // モーダル要素の取得
    const startModal = document.getElementById('start-modal');
    const startButton = document.getElementById('start-button'); // モーダル内のスタートボタン
    
    // キャンバスとコンテキストの設定
    const canvas = document.getElementById('tetris-board');
    const ctx = canvas.getContext('2d');
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;

    const nextPieceCanvas = document.getElementById('next-piece');
    const nextPieceCtx = nextPieceCanvas.getContext('2d');
    nextPieceCanvas.width = BLOCK_SIZE * 4; // ピースの最大幅に合わせて調整
    nextPieceCanvas.height = BLOCK_SIZE * 4; // ピースの最大高さに合わせて調整

    const holdPieceCanvas = document.getElementById('hold-piece');
    const holdPieceCtx = holdPieceCanvas.getContext('2d');
    holdPieceCanvas.width = BLOCK_SIZE * 4; // ピースの最大幅に合わせて調整
    holdPieceCanvas.height = BLOCK_SIZE * 4; // ピースの最大高さに合わせて調整
    
    // テトリミノの形状定義
    const SHAPES = [
        null,
        // I
        [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ],
        // J
        [
            [2, 0, 0],
            [2, 2, 2],
            [0, 0, 0]
        ],
        // L
        [
            [0, 0, 3],
            [3, 3, 3],
            [0, 0, 0]
        ],
        // O
        [
            [4, 4],
            [4, 4]
        ],
        // S
        [
            [0, 5, 5],
            [5, 5, 0],
            [0, 0, 0]
        ],
        // T
        [
            [0, 6, 0],
            [6, 6, 6],
            [0, 0, 0]
        ],
        // Z
        [
            [7, 7, 0],
            [0, 7, 7],
            [0, 0, 0]
        ]
    ];
    
    // ゲーム変数
    let board = createBoard();
    let piece = null;
    let nextPiece = null;
    let holdPiece = null;
    let canHold = true;
    let score = 0;
    let level = 1;
    let gameOver = false;
    let isPaused = false;
    let gameStarted = false; // ゲームが開始されたかどうかを追跡
    let dropCounter = 0;
    let dropInterval = 1000; // 1秒ごとにブロックが下に移動
    let lastTime = 0;
    
    // ゲームボードの作成
    function createBoard() {
        return Array.from({length: ROWS}, () => Array(COLS).fill(0));
    }
    
    // ピースの作成
    function createPiece(type) {
        return {
            position: {x: Math.floor(COLS / 2) - Math.floor(SHAPES[type][0].length / 2), y: 0},
            shape: SHAPES[type],
            type: type
        };
    }
    
    // ランダムなピースの生成
    function getRandomPiece() {
        const pieceType = Math.floor(Math.random() * 7) + 1;
        return createPiece(pieceType);
    }
    
    // ボードの描画
    function drawBoard() {
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        board.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    ctx.fillStyle = COLORS[value];
                    ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                    ctx.strokeStyle = '#000';
                    ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                }
            });
        });
    }
    
    // ピースの描画
    function drawPiece(piece, context, offsetX = 0, offsetY = 0, scale = 1) {
        context.fillStyle = COLORS[piece.type];
        piece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    context.fillRect(
                        (piece.position.x + x) * BLOCK_SIZE * scale + offsetX,
                        (piece.position.y + y) * BLOCK_SIZE * scale + offsetY,
                        BLOCK_SIZE * scale,
                        BLOCK_SIZE * scale
                    );
                    context.strokeStyle = '#000';
                    context.strokeRect(
                        (piece.position.x + x) * BLOCK_SIZE * scale + offsetX,
                        (piece.position.y + y) * BLOCK_SIZE * scale + offsetY,
                        BLOCK_SIZE * scale,
                        BLOCK_SIZE * scale
                    );
                }
            });
        });
    }
    
    // 次のピースの描画
    function drawNextPiece() {
        nextPieceCtx.fillStyle = '#f9f9f9';
        nextPieceCtx.fillRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);
        
        if (nextPiece) {
            // 位置を一時的に調整して中央に表示
            const originalPos = {...nextPiece.position};
            nextPiece.position = {x: 0, y: 0};
            
            // 次のピースの形状に応じてスケールと位置を調整
            const scale = 0.8;
            let offsetX = 20;
            let offsetY = 20;
            
            drawPiece(nextPiece, nextPieceCtx, offsetX, offsetY, scale);
            
            // 位置を元に戻す
            nextPiece.position = originalPos;
        }
    }
    
    // ホールドピースの描画
    function drawHoldPiece() {
        holdPieceCtx.fillStyle = '#f9f9f9';
        holdPieceCtx.fillRect(0, 0, holdPieceCanvas.width, holdPieceCanvas.height);
        
        if (holdPiece) {
            // 位置を一時的に調整して中央に表示
            const originalPos = {...holdPiece.position};
            holdPiece.position = {x: 0, y: 0};
            
            // ピースの幅と高さを計算
            const pieceWidth = holdPiece.shape[0].length;
            const pieceHeight = holdPiece.shape.length;
            
            // 適切なスケールを計算 (最大サイズに合わせて調整)
            const maxDimension = Math.max(pieceWidth, pieceHeight);
            const scale = Math.min(0.7, (holdPieceCanvas.width - 20) / (maxDimension * BLOCK_SIZE));
            
            // 中央に配置するためのオフセットを計算
            const offsetX = (holdPieceCanvas.width - pieceWidth * BLOCK_SIZE * scale) / 2;
            const offsetY = (holdPieceCanvas.height - pieceHeight * BLOCK_SIZE * scale) / 2;
            
            drawPiece(holdPiece, holdPieceCtx, offsetX, offsetY, scale);
            
            // 位置を元に戻す
            holdPiece.position = originalPos;
        }
    }
    
    // 落下地点の計算
    function getDropPosition() {
        // 現在のピースの位置をコピー
        const ghostPiece = {
            position: {x: piece.position.x, y: piece.position.y},
            shape: piece.shape,
            type: piece.type
        };
        
        // ピースをできるだけ下に移動
        while (!checkCollision(ghostPiece)) {
            ghostPiece.position.y++;
        }
        
        // 衝突する直前の位置に戻す
        ghostPiece.position.y--;
        
        return ghostPiece;
    }
    
    // 特定のピースに対して衝突チェックを行う
    function checkCollision(p) {
        for (let y = 0; y < p.shape.length; y++) {
            for (let x = 0; x < p.shape[y].length; x++) {
                if (p.shape[y][x] !== 0 && 
                    (board[y + p.position.y] === undefined ||
                     board[y + p.position.y][x + p.position.x] === undefined ||
                     board[y + p.position.y][x + p.position.x] !== 0)) {
                    return true;
                }
            }
        }
        return false;
    }
    
    // 落下地点の描画
    function drawGhostPiece() {
        if (!piece) return;
        
        const ghostPiece = getDropPosition();
        
        ctx.fillStyle = 'rgba(211, 211, 211, 0.5)'; // 薄いグレー（半透明）
        ctx.strokeStyle = 'rgba(169, 169, 169, 0.8)'; // やや濃いめのグレー（半透明）
        
        ghostPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    ctx.fillRect(
                        (ghostPiece.position.x + x) * BLOCK_SIZE,
                        (ghostPiece.position.y + y) * BLOCK_SIZE,
                        BLOCK_SIZE,
                        BLOCK_SIZE
                    );
                    ctx.strokeRect(
                        (ghostPiece.position.x + x) * BLOCK_SIZE,
                        (ghostPiece.position.y + y) * BLOCK_SIZE,
                        BLOCK_SIZE,
                        BLOCK_SIZE
                    );
                }
            });
        });
    }
    
    // 衝突検出
    function collide() {
        return checkCollision(piece);
    }
    
    // ピースを回転
    function rotatePiece() {
        const originalShape = piece.shape;
        
        // 行列転置
        const rotated = piece.shape[0].map((_, index) =>
            piece.shape.map(row => row[index])
        );
        
        // 行の反転
        piece.shape = rotated.map(row => [...row].reverse());
        
        // 衝突する場合は元に戻す
        if (collide()) {
            piece.shape = originalShape;
        }
    }
    
    // ピースを移動
    function movePiece(dir) {
        piece.position.x += dir;
        if (collide()) {
            piece.position.x -= dir;
        }
    }
    
    // ピースを下に移動
    function dropPiece() {
        piece.position.y++;
        if (collide()) {
            piece.position.y--;
            mergePiece();
            resetPiece();
            clearLines();
            updateScore();
        }
        dropCounter = 0;
    }
    
    // ハードドロップ（即座に一番下まで落とす）
    function hardDrop() {
        while (!collide()) {
            piece.position.y++;
        }
        piece.position.y--;
        mergePiece();
        resetPiece();
        clearLines();
        updateScore();
        dropCounter = 0;
    }
    
    // ピースをホールド
    function holdCurrentPiece() {
        if (!canHold) return;
        
        if (holdPiece === null) {
            // 初めてホールドする場合
            holdPiece = {
                position: {x: 4, y: 0},
                shape: piece.shape,
                type: piece.type
            };
            resetPiece();
        } else {
            // ホールドピースと現在のピースを交換
            const tempPiece = {
                position: {x: 4, y: 0},
                shape: piece.shape,
                type: piece.type
            };
            
            piece = {
                position: {x: 4, y: 0},
                shape: holdPiece.shape,
                type: holdPiece.type
            };
            
            holdPiece = tempPiece;
            
            // 衝突チェック
            if (collide()) {
                // 衝突する場合はゲームオーバー
                gameOver = true;
                // alert('ゲームオーバー！スコア: ' + score); // alertは不要
                resetGame(); // ゲームオーバー時にリセットし、モーダルを表示
                return;
            }
        }
        
        canHold = false;
        drawHoldPiece();
    }
    
    // ピースをボードにマージ
    function mergePiece() {
        piece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    board[y + piece.position.y][x + piece.position.x] = value;
                }
            });
        });
    }
    
    // 新しいピースをリセット
    function resetPiece() {
        piece = nextPiece || getRandomPiece();
        nextPiece = getRandomPiece();
        drawNextPiece();
        canHold = true; // 新しいピースが来たらホールド可能にする
        
        // ゲームオーバーの確認
        if (collide()) {
            gameOver = true;
            // alert('ゲームオーバー！スコア: ' + score); // alertは不要
            resetGame(); // ゲームオーバー時にリセットし、モーダルを表示
        }
    }
    
    // ラインが揃ったかの確認と消去
    function clearLines() {
        let linesCleared = 0;
        
        outer: for (let y = ROWS - 1; y >= 0; y--) {
            for (let x = 0; x < COLS; x++) {
                if (board[y][x] === 0) {
                    continue outer;
                }
            }
            
            // このラインは消去
            const row = board.splice(y, 1)[0].fill(0);
            board.unshift(row);
            y++; // 消去後にインデックスを調整
            linesCleared++;
        }
        
        // スコア更新
        if (linesCleared > 0) {
            // ライン数に応じたスコア加算
            score += [0, 40, 100, 300, 1200][linesCleared] * level;
            document.getElementById('score').textContent = score;
            
            // レベルアップ（10行ごと）
            if (Math.floor(score / 1000) > level - 1) {
                level = Math.floor(score / 1000) + 1;
                document.getElementById('level').textContent = level;
                // スピードアップ
                dropInterval = Math.max(100, 1000 - (level - 1) * 100);
            }
        }
    }
    
    // スコア更新
    function updateScore() {
        document.getElementById('score').textContent = score;
    }
    
    // ゲームループ
    function update(time = 0) {
        if (gameOver) { // ゲームオーバーの場合、モーダルを表示して終了
            startModal.style.display = 'flex';
            return;
        }
        if (!gameStarted) return; // ゲームが開始されていなければ何もしない
        
        const deltaTime = time - lastTime;
        lastTime = time;
        
        if (!isPaused) {
            dropCounter += deltaTime;
            if (dropCounter > dropInterval) {
                dropPiece();
            }
            
            drawBoard();
            drawGhostPiece(); // 落下地点を描画
            if (piece) {
                drawPiece(piece, ctx);
            }
        }
        
        requestAnimationFrame(update);
    }
    
    // キーボード操作
    document.addEventListener('keydown', event => {
        if (gameOver || isPaused) return;
        
        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                movePiece(-1);
                break;
            case 'ArrowRight':
                event.preventDefault();
                movePiece(1);
                break;
            case 'ArrowDown':
                event.preventDefault();
                dropPiece();
                break;
            case 'ArrowUp':
                event.preventDefault();
                rotatePiece();
                break;
            case ' ':
                event.preventDefault();
                hardDrop();
                break;
            case 'c':
            case 'C':
            case 'h':
            case 'H':
                holdCurrentPiece();
                break;
        }
    });

    // モバイル操作ボタンのイベントリスナー
    document.getElementById('mobile-left').addEventListener('click', () => {
        if (gameOver || isPaused) return;
        movePiece(-1);
    });
    document.getElementById('mobile-right').addEventListener('click', () => {
        if (gameOver || isPaused) return;
        movePiece(1);
    });
    document.getElementById('mobile-rotate').addEventListener('click', () => {
        if (gameOver || isPaused) return;
        rotatePiece();
    });
    document.getElementById('mobile-down').addEventListener('click', () => {
        if (gameOver || isPaused) return;
        dropPiece();
    });
    document.getElementById('mobile-hard-drop').addEventListener('click', () => {
        if (gameOver || isPaused) return;
        hardDrop();
    });
    document.getElementById('mobile-hold').addEventListener('click', () => {
        if (gameOver || isPaused) return;
        holdCurrentPiece();
    });

    // タッチスワイプ操作
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    canvas.addEventListener('touchstart', e => {
        if (gameOver || isPaused) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault(); // スクロールを防ぐ
    });

    canvas.addEventListener('touchend', e => {
        if (gameOver || isPaused) return;
        touchEndX = e.changedTouches[0].clientX;
        touchEndY = e.changedTouches[0].clientY;

        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;

        const sensitivity = 30; // スワイプ感度

        if (Math.abs(dx) > Math.abs(dy)) {
            // 横方向のスワイプ
            if (dx > sensitivity) {
                movePiece(1); // 右
            } else if (dx < -sensitivity) {
                movePiece(-1); // 左
            }
        } else {
            // 縦方向のスワイプ
            if (dy > sensitivity) {
                dropPiece(); // 下（ソフトドロップ）
            } else if (dy < -sensitivity) {
                rotatePiece(); // 上（回転）
            }
        }
    });
    
    // ゲームのリセット
    function resetGame() {
        board = createBoard();
        score = 0;
        level = 1;
        gameOver = false;
        isPaused = false;
        gameStarted = false; // ゲームがリセットされたら未開始状態に戻す
        dropInterval = 1000;
        document.getElementById('score').textContent = '0';
        document.getElementById('level').textContent = '1';
        nextPiece = getRandomPiece();
        holdPiece = null;
        canHold = true;
        resetPiece();
        drawHoldPiece();
        drawBoard(); // 初期状態のボードを描画
        drawNextPiece(); // 次のピースを描画

        // ゲームがリセットされたらモーダルを表示
        startModal.style.display = 'flex';
    }
    
    // ゲーム開始ボタン
    startButton.addEventListener('click', () => { // モーダル内のスタートボタン
        if (gameOver) {
            resetGame(); // ゲームオーバー状態からのリセット
            gameOver = false; // リセット後にgameOverフラグをfalseに
        } else if (isPaused) {
            isPaused = false;
        }
        
        if (!gameStarted) {
            gameStarted = true;
            startModal.style.display = 'none'; // ゲーム開始時にモーダルを非表示
            update(); // ゲームループを開始
        }
    });
    
    // 一時停止ボタン
    document.getElementById('pause-button').addEventListener('click', () => {
        isPaused = !isPaused;
    });
    
    // ゲーム初期化
    resetGame(); // ページロード時にモーダルが表示されるようにresetGameを呼び出す
    // update() の呼び出しをここでは行わない - スタートボタンを押すまでゲームは始まらない
    drawBoard(); // 初期状態のボードを描画

    // ダブルクリックによる拡大を防止
    document.body.addEventListener('dblclick', e => {
        e.preventDefault();
    });
});
