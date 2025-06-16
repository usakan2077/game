const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverScreen = document.getElementById('gameOverScreen');
const restartGameButton = document.getElementById('restartGame');
const placeTowerButton = document.getElementById('placeTower');
const placeObstacleButton = document.getElementById('placeObstacle');
const startGameButton = document.getElementById('startGame');
const pointsDisplay = document.getElementById('points');
const waveNumberDisplay = document.getElementById('waveNumberDisplay'); // 新しく追加
const waveCountdownDisplay = document.getElementById('waveCountdownDisplay'); // 新しく追加
const towerSelectionDiv = document.getElementById('towerSelection'); // タワー選択Divを追加

canvas.width = 400;
canvas.height = 480; // 縦を2マス追加 (12 * 40)

const CELL_SIZE = 40;
const GRID_WIDTH = canvas.width / CELL_SIZE; // 400 / 40 = 10
const GRID_HEIGHT = canvas.height / CELL_SIZE; // 480 / 40 = 12

const INITIAL_POINTS = 400; // ポイントの初期値を変数として定義

let gameRunning = false;
let gameOver = false;
let points = INITIAL_POINTS; // 初期値を定数から参照
let placingMode = null; // 'tower' or 'obstacle'

let waveNumber = 0; // 現在のウェーブ数
let enemiesSpawnedThisWave = 0; // 現在のウェーブでスポーンした敵の数
let enemiesPerWave = 10; // 各ウェーブでスポーンする敵の初期数 (複数スポーンの意図に合わせて増やす)
let waveCooldown = 300; // ウェーブ間のクールダウン（フレーム数）
let waveTimer = waveCooldown; // 次のウェーブまでのタイマー

let gameFrame = 0; // ゲームの内部フレームカウンター

const grid = [];
for (let y = 0; y < GRID_HEIGHT; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
        grid[y][x] = { type: 'empty', x: x * CELL_SIZE, y: y * CELL_SIZE };
    }
}

const enemies = [];
const towers = [];
const obstacles = [];
const projectiles = []; // 新しく追加
const explosions = []; // 爆発エフェクトを管理する配列
const healEffects = []; // 回復エフェクトを管理する配列

const TOWER_TYPES = {
    A: { damage: 20, range: 3, speed: 120, cost: 50, color: 'blue' }, // 普通 (攻撃間隔を2倍に)
    B: { damage: 40, range: 2, speed: 120, cost: 70, color: 'darkblue' }, // 高攻撃力、短射程 (攻撃間隔を2倍に)
    C: { damage: 20, range: 4, speed: 180, cost: 60, color: 'lightblue' }, // 長射程、遅攻撃間隔 (攻撃間隔を2倍に)
    D: { damage: 10, range: 3, speed: 60, cost: 40, color: 'cyan' }  // 低攻撃力、速攻撃間隔 (攻撃間隔を2倍に)
};

const ENEMY_TYPES = {
    BALANCE: { baseSpeed: 0.2, baseHealth: 100, color: 'red', type: 'BALANCE' }, // バランス型
    FAST_LOW_HP: { baseSpeed: 0.4, baseHealth: 50, color: 'orange', type: 'FAST_LOW_HP' }, // 移動速度が高く、体力が低い
    SLOW_HIGH_HP: { baseSpeed: 0.1, baseHealth: 200, color: 'darkred', type: 'SLOW_HIGH_HP' }, // 移動速度が低く、体力が高い
    SPLITTER: { baseSpeed: 0.25, baseHealth: 150, color: 'purple', splitThreshold: 75, type: 'SPLITTER' }, // 分裂する敵
    HEALER: { baseSpeed: 0.15, baseHealth: 120, color: 'green', healAmount: 10, healRadius: CELL_SIZE * 2, healInterval: 90, type: 'HEALER' }, // 回復する敵
    BOMBER: { baseSpeed: 0.2, baseHealth: 80, color: 'black', detonateChance: 0.005, bombRadius: CELL_SIZE * 1.5, type: 'BOMBER' }, // 自爆する敵
};

let selectedTowerType = 'A'; // 現在選択されているタワーの種類

class Enemy {
    constructor(x, y, path, wave, type) { // type引数を追加
        const actualWave = wave > 0 ? wave : 1; // waveが0の場合は1として扱う
        const enemyProps = ENEMY_TYPES[type]; // タイプに応じたプロパティを取得
        this.x = x;
        this.y = y;
        this.width = CELL_SIZE * 0.8;
        this.height = CELL_SIZE * 0.8;
        this.speed = enemyProps.baseSpeed + (actualWave * 0.05); // 基本スピードにウェーブ補正
        this.health = enemyProps.baseHealth + (actualWave * 20); // 基本ヘルスにウェーブ補正
        this.maxHealth = this.health; // HPバー表示用に最大ヘルスを保存
        this.path = path;
        this.pathIndex = 0;
        this.color = enemyProps.color; // 敵の色を追加
        this.type = type; // 敵の種類を保存

        // タイプごとの追加プロパティ
        if (this.type === 'SPLITTER') {
            this.splitThreshold = enemyProps.splitThreshold; // 分裂する体力の閾値
            this.hasSplit = false; // 一度分裂したかどうか
        } else if (this.type === 'HEALER') {
            this.healAmount = enemyProps.healAmount; // 回復量
            this.healRadius = enemyProps.healRadius; // 回復範囲
            this.healInterval = enemyProps.healInterval; // 回復間隔
            this.lastHealFrame = 0; // 最後に回復したフレーム
        } else if (this.type === 'BOMBER') {
            this.detonateChance = enemyProps.detonateChance; // 自爆する確率
            this.bombRadius = enemyProps.bombRadius; // 自爆範囲
        }
    }

    draw() {
        ctx.fillStyle = this.color; // 敵の種類に応じた色で描画
        ctx.fillRect(this.x + (CELL_SIZE - this.width) / 2, this.y + (CELL_SIZE - this.height) / 2, this.width, this.height);
        // HPバーの描画
        ctx.fillStyle = 'lime';
        ctx.fillRect(this.x + (CELL_SIZE - this.width) / 2, this.y - 5, this.width * (this.health / this.maxHealth), 3); // maxHealthを使用
        ctx.strokeStyle = 'black';
        ctx.strokeRect(this.x + (CELL_SIZE - this.width) / 2, this.y - 5, this.width, 3);
    }

    update(gameFrame) { // gameFrameを引数に追加
        // 敵が最下段に到達したらゲームオーバー
        if (this.y >= canvas.height - CELL_SIZE) {
            gameOver = true;
            return; // それ以上移動しない
        }

        if (this.pathIndex < this.path.length) {
            const targetX = this.path[this.pathIndex].x * CELL_SIZE;
            const targetY = this.path[this.pathIndex].y * CELL_SIZE;

            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.speed) {
                this.x = targetX;
                this.y = targetY;
                this.pathIndex++;
            } else {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
            }
        } else {
            // パスの終点に到達したが、まだ最下段ではない場合（通常起こらないはずだが念のため）
            // または、パスの終点が最下段の途中のセルである場合
            gameOver = true;
        }

        // 分裂する敵のロジック
        if (this.type === 'SPLITTER' && !this.hasSplit && this.health <= this.splitThreshold && this.health > 0) {
            this.split();
            this.hasSplit = true; // 一度分裂したらそれ以上分裂しない
        }

        // 回復する敵のロジック
        if (this.type === 'HEALER' && gameFrame - this.lastHealFrame > this.healInterval) {
            this.healNearbyEnemies();
            this.lastHealFrame = gameFrame;
        }
    }

    split() {
        console.log(`SPLITTERが分裂しました！`);
        // 現在の敵の体力を半分にする
        this.health /= 2;
        this.maxHealth = this.health; // 最大ヘルスも更新

        // 新しい敵を2体生成
        const newEnemy1 = new Enemy(this.x - CELL_SIZE / 4, this.y, this.path.slice(this.pathIndex), waveNumber, this.type);
        newEnemy1.health = this.health;
        newEnemy1.maxHealth = this.health;
        newEnemy1.pathIndex = 0; // 新しい敵は現在のパスの途中から開始
        enemies.push(newEnemy1);

        const newEnemy2 = new Enemy(this.x + CELL_SIZE / 4, this.y, this.path.slice(this.pathIndex), waveNumber, this.type);
        newEnemy2.health = this.health;
        newEnemy2.maxHealth = this.health;
        newEnemy2.pathIndex = 0; // 新しい敵は現在のパスの途中から開始
        enemies.push(newEnemy2);
    }

    healNearbyEnemies() {
        console.log(`HEALERが周囲の敵を回復します！`);
        for (const enemy of enemies) {
            if (enemy === this) continue; // 自分自身は回復しない

            const dx = (enemy.x + CELL_SIZE / 2) - (this.x + CELL_SIZE / 2);
            const dy = (enemy.y + CELL_SIZE / 2) - (this.y + CELL_SIZE / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.healRadius) {
                enemy.health = Math.min(enemy.maxHealth, enemy.health + this.healAmount);
                healEffects.push(new HealEffect(enemy.x, enemy.y)); // 回復エフェクトを生成
            }
        }
    }
}

class Tower {
    constructor(gridX, gridY, type) { // type引数を追加
        this.x = gridX * CELL_SIZE;
        this.y = gridY * CELL_SIZE;
        this.width = CELL_SIZE * 0.8;
        this.height = CELL_SIZE * 0.8;
        
        const towerProps = TOWER_TYPES[type];
        this.attackDamage = towerProps.damage;
        this.attackRange = towerProps.range * CELL_SIZE; // CELL_SIZEを掛けて実際のピクセル値に変換
        this.attackSpeed = towerProps.speed;
        this.color = towerProps.color; // タワーの色を追加
        this.type = type; // タワーの種類を保存

        this.lastAttack = 0;
    }

    draw() {
        ctx.fillStyle = this.color; // タワーの種類に応じた色で描画
        ctx.fillRect(this.x + (CELL_SIZE - this.width) / 2, this.y + (CELL_SIZE - this.height) / 2, this.width, this.height);
    }

    update(frame) {
        if (frame - this.lastAttack > this.attackSpeed) {
            const target = this.findTarget();
            if (target) {
                // 玉を発射
                projectiles.push(new Projectile(
                    this.x + CELL_SIZE / 2, // タワーの中心から
                    this.y + CELL_SIZE / 2, // タワーの中心から
                    target,
                    this.attackDamage // タワーの攻撃力を玉に渡す
                ));
                this.lastAttack = frame;
                console.log(`タワーが玉を発射しました！`);
            }
        }
    }

    findTarget() {
        for (const enemy of enemies) {
            const dx = (enemy.x + CELL_SIZE / 2) - (this.x + CELL_SIZE / 2);
            const dy = (enemy.y + CELL_SIZE / 2) - (this.y + CELL_SIZE / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < this.attackRange) {
                return enemy;
            }
        }
        return null;
    }
}

class Projectile {
    constructor(x, y, target, damage) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.speed = 8; // 玉の速度
        this.radius = 5; // 玉の半径
    }

    draw() {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    update() {
        if (!this.target || this.target.health <= 0) {
            // ターゲットがいないか、すでに倒されている場合は玉を削除
            return true; // 削除フラグ
        }

        const dx = (this.target.x + CELL_SIZE / 2) - this.x;
        const dy = (this.target.y + CELL_SIZE / 2) - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.speed) {
            // ターゲットに到達
            this.target.health -= this.damage;
            console.log(`玉が敵に命中！敵の残りHP: ${this.target.health}`);
            return true; // 削除フラグ
        } else {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
            return false; // 削除しない
        }
    }
}

class Obstacle {
    constructor(gridX, gridY) {
        this.x = gridX * CELL_SIZE;
        this.y = gridY * CELL_SIZE;
        this.width = CELL_SIZE * 0.8;
        this.height = CELL_SIZE * 0.8;
    }

    draw() {
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x + (CELL_SIZE - this.width) / 2, this.y + (CELL_SIZE - this.height) / 2, this.width, this.height);
    }
}

class Explosion {
    constructor(x, y) {
        this.x = x + CELL_SIZE / 2; // 敵の中心に合わせる
        this.y = y + CELL_SIZE / 2; // 敵の中心に合わせる
        this.radius = 5;
        this.maxRadius = CELL_SIZE * 0.8; // 敵のサイズに合わせて調整
        this.life = 30; // 爆発の持続時間（フレーム数）
        this.maxLife = this.life;
    }

    draw() {
        const alpha = this.life / this.maxLife; // 寿命に応じて透明度を変化
        ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`; // オレンジ色で半透明
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    update() {
        this.radius += 2; // 半径を拡大
        this.life--; // 寿命を減らす
        return this.life <= 0; // 寿命が尽きたらtrueを返す
    }
}

class HealEffect {
    constructor(x, y) {
        this.x = x + CELL_SIZE / 2; // 敵の中心に合わせる
        this.y = y + CELL_SIZE / 2; // 敵の中心に合わせる
        this.radius = 1;
        this.maxRadius = CELL_SIZE * 0.6; // 回復エフェクトのサイズ
        this.life = 20; // 持続時間
        this.maxLife = this.life;
    }

    draw() {
        const alpha = this.life / this.maxLife;
        ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`; // 緑色で半透明
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    update() {
        this.radius += 1;
        this.life--;
        return this.life <= 0;
    }
}

function drawGrid() {
    ctx.strokeStyle = '#ccc';
    for (let x = 0; x <= GRID_WIDTH; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL_SIZE, 0);
        ctx.lineTo(x * CELL_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= GRID_HEIGHT; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL_SIZE);
        ctx.lineTo(canvas.width, y * CELL_SIZE);
        ctx.stroke();
    }

    // スタートとゴールの行に色を付ける
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'; // 薄い赤
    ctx.fillRect(0, 0 * CELL_SIZE, canvas.width, CELL_SIZE); // スタート行
    ctx.fillRect(0, (GRID_HEIGHT - 1) * CELL_SIZE, canvas.width, CELL_SIZE); // ゴール行
}

function drawObjects() {
    for (const obstacle of obstacles) {
        obstacle.draw();
    }
    for (const tower of towers) {
        tower.draw();
    }
    for (const enemy of enemies) {
        enemy.draw();
    }
    for (const projectile of projectiles) { // 玉を描画
        projectile.draw();
    }
    for (const explosion of explosions) { // 爆発エフェクトを描画
        explosion.draw();
    }
    for (const healEffect of healEffects) { // 回復エフェクトを描画
        healEffect.draw();
    }
}

function updateGame(gameFrame) {
    if (gameOver) {
        gameOverScreen.style.display = 'block';
        return;
    }

    // 敵の更新と削除 (逆順ループで安全に削除)
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update();
        if (enemies[i].health <= 0) {
            explosions.push(new Explosion(enemies[i].x, enemies[i].y)); // 爆発エフェクトを生成
            enemies.splice(i, 1);
            points += 20; // 敵を倒したら20ポイント獲得
            pointsDisplay.textContent = points;
            console.log(`敵を倒しました！現在のポイント: ${points}`);
        }
    }

    towers.forEach(tower => {
        tower.update(gameFrame); // gameFrameを渡す
    });

    // 玉の更新と削除
    for (let i = projectiles.length - 1; i >= 0; i--) {
        if (projectiles[i].update()) { // updateがtrueを返したら削除
            projectiles.splice(i, 1);
        }
    }

    // 爆発エフェクトの更新と削除
    for (let i = explosions.length - 1; i >= 0; i--) {
        if (explosions[i].update()) { // updateがtrueを返したら削除
            explosions.splice(i, 1);
        }
    }

    // 回復エフェクトの更新と削除
    for (let i = healEffects.length - 1; i >= 0; i--) {
        if (healEffects[i].update()) { // updateがtrueを返したら削除
            healEffects.splice(i, 1);
        }
    }

    // Wave management and enemy spawning
    // デバッグログ
    console.log(`enemies.length: ${enemies.length}, enemiesSpawnedThisWave: ${enemiesSpawnedThisWave}, enemiesPerWave: ${enemiesPerWave}, waveTimer: ${waveTimer}`);

    if (enemiesSpawnedThisWave < enemiesPerWave) {
        // スポーンフェーズ: まだスポーンする敵がいる場合
        if (waveNumber > 0 && gameFrame % 30 === 0) { // ウェーブが開始されており、敵のスポーン間隔 (約0.5秒ごと)
            console.log(`--- スポーン試行: frame ${gameFrame}, enemiesSpawnedThisWave ${enemiesSpawnedThisWave} ---`); // 追加ログ
            const startX = Math.floor(Math.random() * GRID_WIDTH);
            const startY = 0; // Always start at the top
            const endX = Math.floor(Math.random() * GRID_WIDTH); // 最下部のランダムなX座標
            const endY = GRID_HEIGHT - 1; // 最下部のY座標
            
            // ランダムな敵タイプを選択
            const enemyTypes = Object.keys(ENEMY_TYPES);
            const randomEnemyType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];

            const path = findPath({ x: startX, y: startY }, { x: endX, y: endY}); // Path to random bottom cell
            if (path) {
                enemies.push(new Enemy(startX * CELL_SIZE, startY * CELL_SIZE, path, waveNumber, randomEnemyType)); // typeを渡す
                console.log(`敵をスポーンしました！現在の敵数: ${enemies.length}, タイプ: ${randomEnemyType}`); // 追加ログ
            } else {
                console.log(`No path found for enemy at Start: (${startX}, ${startY}), End: (${endX}, ${endY}). Enemy not spawned.`); // パスなしログ
            }
            enemiesSpawnedThisWave++; // パスが見つからなくてもインクリメント
            console.log(`enemiesSpawnedThisWaveをインクリメントしました: ${enemiesSpawnedThisWave}`); // 追加ログ
        }
        updateWaveCountdownDisplay('---'); // スポーン中は「---」を表示
    } else {
        // クールダウンフェーズ: すべての敵がスポーンし終わった場合
        if (waveTimer > 0) { // waveTimerが0より大きい間はカウントダウン
            waveTimer--;
            updateWaveCountdownDisplay(Math.ceil(waveTimer / 60)); // クールダウン中は残り秒数を表示
        } else { // waveTimerが0以下になったら次のウェーブ開始を待つ
            if (enemies.length === 0) { // すべての敵が倒されたら次のウェーブを開始
                waveNumber++;
                enemiesSpawnedThisWave = 0;
                enemiesPerWave += 3; // 次のウェーブでスポーンする敵の数を増やす (より多く)
                waveTimer = waveCooldown; // タイマーをリセット
                console.log(`ウェーブ ${waveNumber} 開始！`);
                updateWaveNumberDisplay(); // ウェーブ数を更新
                updateWaveCountdownDisplay(Math.ceil(waveTimer / 60)); // 新しいクールダウンの開始値を表示
            } else {
                updateWaveCountdownDisplay('---'); // 敵が残っている場合は「---」を表示
            }
        }
    }
}

let mouseGridX = -1;
let mouseGridY = -1;

function gameLoop() { // frame引数を削除
    requestAnimationFrame(gameLoop); // ここで再帰呼び出し
    
    gameFrame++; // フレーム数をインクリメント

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawObjects();

    // タワー設置モード時に攻撃範囲を表示
    if (!gameRunning && placingMode === 'tower' && mouseGridX !== -1 && mouseGridY !== -1) {
        ctx.beginPath();
        // 選択中のタワータイプに基づいて攻撃範囲を取得
        const currentTowerRange = TOWER_TYPES[selectedTowerType].range * CELL_SIZE;
        ctx.arc(
            mouseGridX * CELL_SIZE + CELL_SIZE / 2,
            mouseGridY * CELL_SIZE + CELL_SIZE / 2,
            currentTowerRange,
            0,
            Math.PI * 2
        );
        ctx.fillStyle = 'rgba(0, 0, 255, 0.2)'; // 半透明の青
        ctx.fill();
        ctx.strokeStyle = 'blue';
        ctx.stroke();
    }

    if (gameRunning) {
        updateGame(gameFrame); // gameFrameを渡す
    }
    updateButtonLabels(); // ボタンラベルを更新
}

function resetGame() {
    gameRunning = false;
    gameOver = false;
    points = INITIAL_POINTS; // ポイントを定数からリセット
    pointsDisplay.textContent = points;
    enemies.length = 0;
    towers.length = 0;
    obstacles.length = 0;
    projectiles.length = 0; // 玉もリセット
    explosions.length = 0; // 爆発エフェクトもリセット
    healEffects.length = 0; // 回復エフェクトもリセット
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            grid[y][x].type = 'empty';
        }
    }
    gameOverScreen.style.display = 'none';
    placingMode = null;
    mouseGridX = -1; // マウス位置もリセット
    mouseGridY = -1; // マウス位置もリセット

    // ウェーブ関連の変数をリセット
    waveNumber = 0;
    enemiesSpawnedThisWave = 0;
    enemiesPerWave = 10; // 初期値に戻す (複数スポーンの意図に合わせて増やす)
    waveTimer = waveCooldown;
    gameFrame = 0; // ゲームフレームカウンターもリセット

    updateButtonLabels(); // ボタンラベルを更新
    updateWaveCountdownDisplay('---'); // リセット時もカウントダウンを「---」に設定
}

// Pathfinding (A* algorithm)
function findPath(start, end) {
    const openSet = [start];
    const cameFrom = {};
    const gScore = {};
    const fScore = {};

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const key = `${x},${y}`;
            gScore[key] = Infinity;
            fScore[key] = Infinity;
        }
    }

    const startKey = `${start.x},${start.y}`;
    gScore[startKey] = 0;
    fScore[startKey] = heuristic(start, end);

    while (openSet.length > 0) {
        let current = openSet.reduce((minNode, node) => {
            const minKey = `${minNode.x},${minNode.y}`;
            const nodeKey = `${node.x},${node.y}`;
            return fScore[nodeKey] < fScore[minKey] ? node : minNode;
        });

        if (current.x === end.x && current.y === end.y) {
            return reconstructPath(cameFrom, current);
        }

        openSet.splice(openSet.indexOf(current), 1);

        const neighbors = getNeighbors(current);
        for (const neighbor of neighbors) {
            const tentative_gScore = gScore[`${current.x},${current.y}`] + 1; // Distance between nodes is 1

            if (tentative_gScore < gScore[`${neighbor.x},${neighbor.y}`]) {
                cameFrom[`${neighbor.x},${neighbor.y}`] = current;
                gScore[`${neighbor.x},${neighbor.y}`] = tentative_gScore;
                fScore[`${neighbor.x},${neighbor.y}`] = tentative_gScore + heuristic(neighbor, end);
                if (!openSet.some(node => node.x === neighbor.x && node.y === neighbor.y)) {
                    openSet.push(neighbor);
                }
            }
        }
    }

    return null; // No path found
}

function heuristic(nodeA, nodeB) {
    // Manhattan distance
    return Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);
}

function getNeighbors(node, currentGrid) {
    const neighbors = [];
    const directions = [
        { dx: 0, dy: -1 }, // Up
        { dx: 0, dy: 1 },  // Down
        { dx: -1, dy: 0 }, // Left
        { dx: 1, dy: 0 }   // Right
    ];

    for (const dir of directions) {
        const nx = node.x + dir.dx;
        const ny = node.y + dir.dy;

        if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
            // 障害物またはタワー（タワーもルートを塞ぐとみなす）を通過できないようにする
            if (currentGrid[ny][nx].type !== 'obstacle' && currentGrid[ny][nx].type !== 'tower') {
                neighbors.push({ x: nx, y: ny });
            }
        }
    }
    return neighbors;
}

function reconstructPath(cameFrom, current) {
    const totalPath = [current];
    while (cameFrom[`${current.x},${current.y}`]) {
        current = cameFrom[`${current.x},${current.y}`];
        totalPath.unshift(current);
    }
    return totalPath;
}

// パスが完全に塞がれないかチェックする関数
function canPlaceObject(gridX, gridY, objectType) {
    // 現在のグリッドの状態をコピー
    const tempGrid = JSON.parse(JSON.stringify(grid));

    // 仮にオブジェクトを配置
    tempGrid[gridY][gridX].type = objectType;

    // すべての可能なスタート地点（上端のセル）からすべての可能なゴール地点（下端のセル）へのパスをチェック
    // 少なくとも1つのパスが存在すればOK
    for (let startX = 0; startX < GRID_WIDTH; startX++) {
        const startNode = { x: startX, y: 0 };
        // スタート地点がオブジェクトで塞がれていないか確認
        if (tempGrid[startNode.y][startNode.x].type !== 'obstacle' && tempGrid[startNode.y][startNode.x].type !== 'tower') {
            for (let endX = 0; endX < GRID_WIDTH; endX++) {
                const endNode = { x: endX, y: GRID_HEIGHT - 1 };
                // ゴール地点がオブジェクトで塞がれていないか確認
                if (tempGrid[endNode.y][endNode.x].type !== 'obstacle' && tempGrid[endNode.y][endNode.x].type !== 'tower') {
                    // findPath関数に一時的なグリッドを渡す
                    if (findPath(startNode, endNode, tempGrid)) {
                        return true; // パスが見つかった
                    }
                }
            }
        }
    }
    return false; // どのパスも見つからなかった
}

// findPath関数を修正し、グリッドを引数として受け取るようにする
function findPath(start, end, currentGrid) {
    currentGrid = currentGrid || grid; // デフォルトはグローバルなgridを使用

    const openSet = [start];
    const cameFrom = {};
    const gScore = {};
    const fScore = {};

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            const key = `${x},${y}`;
            gScore[key] = Infinity;
            fScore[key] = Infinity;
        }
    }

    const startKey = `${start.x},${start.y}`;
    gScore[startKey] = 0;
    fScore[startKey] = heuristic(start, end);

    while (openSet.length > 0) {
        let current = openSet.reduce((minNode, node) => {
            const minKey = `${minNode.x},${minNode.y}`;
            const nodeKey = `${node.x},${node.y}`;
            return fScore[nodeKey] < fScore[minKey] ? node : minNode;
        });

        if (current.x === end.x && current.y === end.y) {
            return reconstructPath(cameFrom, current);
        }

        openSet.splice(openSet.indexOf(current), 1);

        const neighbors = getNeighbors(current, currentGrid); // 修正: currentGridを渡す
        for (const neighbor of neighbors) {
            const tentative_gScore = gScore[`${current.x},${current.y}`] + 1; // Distance between nodes is 1

            if (tentative_gScore < gScore[`${neighbor.x},${neighbor.y}`]) {
                cameFrom[`${neighbor.x},${neighbor.y}`] = current;
                gScore[`${neighbor.x},${neighbor.y}`] = tentative_gScore;
                fScore[`${neighbor.x},${neighbor.y}`] = tentative_gScore + heuristic(neighbor, end);
                if (!openSet.some(node => node.x === neighbor.x && node.y === neighbor.y)) {
                    openSet.push(neighbor);
                }
            }
        }
    }

    return null; // No path found
}


// Helper function to update button labels
function updateButtonLabels() {
    if (gameRunning) {
        startGameButton.textContent = '侵攻中';
        startGameButton.disabled = true; // ゲーム中はボタンを無効化
    } else {
        startGameButton.textContent = 'ゲーム開始';
        startGameButton.disabled = false; // 一時停止中はボタンを有効化
    }

    // タワー選択ボタンのスタイルを更新
    document.querySelectorAll('#towerSelection button').forEach(button => {
        if (button.id === `selectTower${selectedTowerType}`) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });

    if (placingMode === 'tower') {
        placeTowerButton.textContent = `タワー設置中 (${selectedTowerType})`;
        placeObstacleButton.textContent = '障害物設置モード';
        towerSelectionDiv.style.display = 'block'; // タワー設置モード時に表示
    } else if (placingMode === 'obstacle') {
        placeTowerButton.textContent = 'タワー設置モード';
        placeObstacleButton.textContent = '障害物設置中';
        towerSelectionDiv.style.display = 'none'; // 障害物設置モード時は非表示
    }
    else {
        placeTowerButton.textContent = 'タワー設置モード';
        placeObstacleButton.textContent = '障害物設置モード';
        towerSelectionDiv.style.display = 'none'; // 通常時は非表示
    }
}

// Helper function to update wave number display
function updateWaveNumberDisplay() {
    waveNumberDisplay.textContent = waveNumber;
}

// Helper function to update wave countdown display
function updateWaveCountdownDisplay(time) {
    waveCountdownDisplay.textContent = time;
}

// Event Listeners
startGameButton.addEventListener('click', () => {
    if (!gameRunning) {
        gameRunning = true;
        placingMode = null; // 設置モードを解除
        updateButtonLabels(); // ボタンラベルを更新
        
        // ゲーム開始時に最初のウェーブを開始
        if (waveNumber === 0) {
            waveNumber = 1;
            enemiesSpawnedThisWave = 0;
            // waveTimerはwaveCooldownの初期値のままにする (すぐにスポーンさせない)
            console.log(`ウェーブ ${waveNumber} 開始！`);
        }
        updateWaveNumberDisplay(); // ウェーブ数を更新
        // ゲーム開始時はクールダウンが始まるので、カウントダウンを表示
        updateWaveCountdownDisplay(Math.ceil(waveTimer / 60));

        gameLoop(); // Start the game loop
    }
});

restartGameButton.addEventListener('click', () => {
    resetGame();
    updateButtonLabels(); // ボタンラベルを更新
    updateWaveCountdownDisplay('---'); // リセット時もカウントダウンを「---」に設定
});

placeTowerButton.addEventListener('click', () => {
    placingMode = 'tower';
    gameRunning = false; // ゲームを一時停止
    updateButtonLabels(); // ボタンラベルを更新
    console.log(`タワー設置モードが有効になりました。選択中のタワー: ${selectedTowerType}`);
});

placeObstacleButton.addEventListener('click', () => {
    placingMode = 'obstacle';
    gameRunning = false; // ゲームを一時停止
    updateButtonLabels(); // ボタンラベルを更新
    console.log('障害物設置モードが有効になりました。');
});

canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    mouseGridX = Math.floor(mouseX / CELL_SIZE);
    mouseGridY = Math.floor(mouseY / CELL_SIZE);
});

canvas.addEventListener('click', (event) => {
    if (!gameRunning && placingMode) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const gridX = Math.floor(mouseX / CELL_SIZE);
        const gridY = Math.floor(mouseY / CELL_SIZE);

        if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
            // スタート行とゴール行にはタワーや障害物を置けないようにする
            if (gridY === 0 || gridY === GRID_HEIGHT - 1) {
                console.log('スタート/ゴール地点にはタワーや障害物を設置できません。');
                return;
            }

            if (grid[gridY][gridX].type === 'empty') {
                let canPlace = false;
                if (placingMode === 'tower') {
                    canPlace = canPlaceObject(gridX, gridY, 'tower');
                } else if (placingMode === 'obstacle') {
                    canPlace = canPlaceObject(gridX, gridY, 'obstacle');
                }

                if (canPlace) {
                    if (placingMode === 'tower') {
                        const towerCost = TOWER_TYPES[selectedTowerType].cost;
                        if (points >= towerCost) {
                            towers.push(new Tower(gridX, gridY, selectedTowerType)); // 選択されたタイプを渡す
                            grid[gridY][gridX].type = 'tower';
                            points -= towerCost;
                            pointsDisplay.textContent = points;
                            console.log(`タワー ${selectedTowerType} を設置しました: (${gridX}, ${gridY})`);
                        } else {
                            console.log(`ポイントが足りません！タワー ${selectedTowerType} には ${towerCost} ポイント必要です。`);
                        }
                    } else if (placingMode === 'obstacle' && points >= 20) {
                        obstacles.push(new Obstacle(gridX, gridY));
                        grid[gridY][gridX].type = 'obstacle';
                        points -= 20;
                        pointsDisplay.textContent = points;
                        console.log(`障害物を設置しました: (${gridX}, ${gridY})`);
                    } else if (placingMode === 'obstacle' && points < 20) {
                        console.log('ポイントが足りません！障害物には20ポイント必要です。');
                    }

                    // すべての敵のパスを再計算
                    enemies.forEach(enemy => {
                        // 敵の現在のグリッド座標を計算
                        const currentGridX = Math.floor(enemy.x / CELL_SIZE);
                        const currentGridY = Math.floor(enemy.y / CELL_SIZE);
                        const startNode = { x: currentGridX, y: currentGridY };
                        
                        // ゴール地点は敵の現在のパスの最終地点、または最下段の任意の地点
                        // ここではシンプルに最下段のランダムなX座標をゴールとする
                        const endX = Math.floor(Math.random() * GRID_WIDTH); 
                        const endY = GRID_HEIGHT - 1;
                        const endNode = { x: endX, y: endY };

                        const newPath = findPath(startNode, endNode);
                        if (newPath) {
                            enemy.path = newPath;
                            enemy.pathIndex = 0; // パスの最初から再開
                        } else {
                            // 新しいパスが見つからない場合、敵を削除
                            console.log(`敵 (${enemy.x}, ${enemy.y}) の新しいパスが見つかりませんでした。敵を削除します。`);
                            enemies.splice(enemies.indexOf(enemy), 1); // 敵を配列から削除
                        }
                    });

                } else {
                    console.log('その場所に設置すると、敵のルートが完全に塞がれてしまいます！');
                }
            } else {
                console.log('その場所にはすでに何かがあります。');
            }
        }
    } else if (gameRunning) {
        console.log('ゲーム中は設置できません。');
    }
});

// Event Listeners for tower selection buttons
document.getElementById('selectTowerA').addEventListener('click', () => {
    selectedTowerType = 'A';
    updateButtonLabels();
    console.log('タワーAが選択されました。');
});
document.getElementById('selectTowerB').addEventListener('click', () => {
    selectedTowerType = 'B';
    updateButtonLabels();
    console.log('タワーBが選択されました。');
});
document.getElementById('selectTowerC').addEventListener('click', () => {
    selectedTowerType = 'C';
    updateButtonLabels();
    console.log('タワーCが選択されました。');
});
document.getElementById('selectTowerD').addEventListener('click', () => {
    selectedTowerType = 'D';
    updateButtonLabels();
    console.log('タワーDが選択されました。');
});

// Initial setup
pointsDisplay.textContent = points; // 初期ポイントを表示
updateButtonLabels(); // 初期ボタンラベルを更新
gameLoop(); // ゲームループを開始
