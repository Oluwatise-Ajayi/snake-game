import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Play, RotateCcw, Pause, Settings, Activity, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

// --- Constants ---
const CELL_SIZE = 20;
const GRID_WIDTH = 40; // 800px
const GRID_HEIGHT = 25; // 500px
const INITIAL_SPEED = 100;
const POWERUP_DURATION = 7000;

type Point = { x: number; y: number };
type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
type PowerUpType = 'GHOST' | 'WRAP' | null;
type FoodType = 'NORMAL' | 'GHOST' | 'WRAP';

// Mock Leaderboard Data
const MOCK_LEADER_BOARD = [
    { name: 'ULTRA_SNK', score: 4850 },
    { name: 'COLD_BLOOD', score: 3200 },
];

const GameCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gameState, setGameState] = useState<GameState>('START');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem('neon-snake-high-score') || '0'));
    const [activePowerUp, setActivePowerUp] = useState<PowerUpType>(null);

    // Game Mutable State
    const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }]);
    const directionRef = useRef<Point>({ x: 1, y: 0 });
    const nextDirectionRef = useRef<Point>({ x: 1, y: 0 });
    const foodRef = useRef<{ x: number; y: number; type: FoodType }>({ x: 15, y: 10, type: 'NORMAL' });
    const speedRef = useRef(INITIAL_SPEED);
    const lastRenderTimeRef = useRef(0);
    const powerUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Touch Handling State
    const touchStartRef = useRef<Point | null>(null);

    // --- Audio ---
    const playSound = useCallback((type: 'eat' | 'die' | 'powerup' | 'click') => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'eat') {
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1600, now + 0.05);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'die') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.5);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        } else if (type === 'powerup') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        }
    }, []);

    // --- Game Logic ---
    const spawnFood = () => {
        let type: FoodType = 'NORMAL';
        const rand = Math.random();
        if (rand > 0.85) type = 'GHOST';
        else if (rand > 0.70) type = 'WRAP';
        
        const newFood = {
            x: Math.floor(Math.random() * GRID_WIDTH),
            y: Math.floor(Math.random() * GRID_HEIGHT),
            type
        };
        foodRef.current = newFood;
    };

    const activatePowerUp = (type: PowerUpType) => {
        if (!type) return;
        setActivePowerUp(type);
        playSound('powerup');
        if (powerUpTimeoutRef.current) clearTimeout(powerUpTimeoutRef.current);
        powerUpTimeoutRef.current = setTimeout(() => setActivePowerUp(null), POWERUP_DURATION);
    };

    const resetGame = () => {
        snakeRef.current = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }]; // Head + Tail
        directionRef.current = { x: 1, y: 0 };
        nextDirectionRef.current = { x: 1, y: 0 };
        setScore(0);
        setGameState('PLAYING');
        speedRef.current = INITIAL_SPEED;
        setActivePowerUp(null);
        spawnFood();
        playSound('click');
        if (powerUpTimeoutRef.current) clearTimeout(powerUpTimeoutRef.current);
    };

    const gameOver = () => {
        playSound('die');
        setGameState('GAME_OVER');
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('neon-snake-high-score', score.toString());
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#4ade80', '#22c55e', '#ffffff'] });
        }
    };

    const togglePause = () => {
        if (gameState === 'PLAYING') setGameState('PAUSED');
        else if (gameState === 'PAUSED') setGameState('PLAYING');
        playSound('click');
    };

    const handleDirectionChange = (newDir: Point) => {
        const currentDir = directionRef.current;
        // Prevent 180 degree turns
        if (newDir.x !== 0 && currentDir.x !== 0) return;
        if (newDir.y !== 0 && currentDir.y !== 0) return;
        
        nextDirectionRef.current = newDir;
    };

    // --- Controls ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                if (gameState === 'GAME_OVER' || gameState === 'START') resetGame();
                else togglePause();
                return;
            }

            if (gameState !== 'PLAYING') return;
            
            const { key } = e;
            
            if (key === 'ArrowUp') handleDirectionChange({ x: 0, y: -1 });
            if (key === 'ArrowDown') handleDirectionChange({ x: 0, y: 1 });
            if (key === 'ArrowLeft') handleDirectionChange({ x: -1, y: 0 });
            if (key === 'ArrowRight') handleDirectionChange({ x: 1, y: 0 });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState]);

    // --- Touch Controls ---
    const handleTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;
        
        // Minimum swipe distance
        if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;

        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal
            if (dx > 0) handleDirectionChange({ x: 1, y: 0 }); // Right
            else handleDirectionChange({ x: -1, y: 0 }); // Left
        } else {
            // Vertical
            if (dy > 0) handleDirectionChange({ x: 0, y: 1 }); // Down
            else handleDirectionChange({ x: 0, y: -1 }); // Up
        }
        touchStartRef.current = null;
    };

    // --- Game Loop ---
    useEffect(() => {
        if (gameState !== 'PLAYING') return;

        let animationFrameId: number;

        const loop = (time: number) => {
            const timeSinceLastRender = time - lastRenderTimeRef.current;
            
            if (timeSinceLastRender > speedRef.current) {
                lastRenderTimeRef.current = time;
                directionRef.current = nextDirectionRef.current;
                
                const head = snakeRef.current[0];
                let newHead = { x: head.x + directionRef.current.x, y: head.y + directionRef.current.y };

                // Walls
                if (activePowerUp === 'WRAP') {
                    if (newHead.x < 0) newHead.x = GRID_WIDTH - 1;
                    if (newHead.x >= GRID_WIDTH) newHead.x = 0;
                    if (newHead.y < 0) newHead.y = GRID_HEIGHT - 1;
                    if (newHead.y >= GRID_HEIGHT) newHead.y = 0;
                } else {
                    if (newHead.x < 0 || newHead.x >= GRID_WIDTH || newHead.y < 0 || newHead.y >= GRID_HEIGHT) {
                        gameOver();
                        return;
                    }
                }

                // Self Collision
                if (activePowerUp !== 'GHOST') {
                    for (let part of snakeRef.current) {
                        if (newHead.x === part.x && newHead.y === part.y) {
                            gameOver();
                            return;
                        }
                    }
                }

                const newSnake = [newHead, ...snakeRef.current];
                
                if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
                    playSound('eat');
                    setScore(s => s + 50);
                    if (foodRef.current.type === 'GHOST') activatePowerUp('GHOST');
                    if (foodRef.current.type === 'WRAP') activatePowerUp('WRAP');
                    spawnFood();
                } else {
                    newSnake.pop();
                }

                snakeRef.current = newSnake;
            }

            // --- Render ---
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) {
                // Background
                ctx.fillStyle = '#020604'; // Very Dark Green/Black
                ctx.fillRect(0, 0, GRID_WIDTH * CELL_SIZE, GRID_HEIGHT * CELL_SIZE);

                // Grid Lines
                ctx.strokeStyle = '#064e3b'; // Emerald-900 (Dark Green)
                ctx.lineWidth = 1;
                for (let i = 1; i < GRID_WIDTH; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * CELL_SIZE, 0);
                    ctx.lineTo(i * CELL_SIZE, GRID_HEIGHT * CELL_SIZE);
                    ctx.stroke();
                }
                for (let j = 1; j < GRID_HEIGHT; j++) {
                    ctx.beginPath();
                    ctx.moveTo(0, j * CELL_SIZE);
                    ctx.lineTo(GRID_WIDTH * CELL_SIZE, j * CELL_SIZE);
                    ctx.stroke();
                }

                // Border Highlight
                const borderColor = activePowerUp === 'WRAP' ? '#ec4899' : '#10b981';
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(1, 1, GRID_WIDTH * CELL_SIZE - 2, GRID_HEIGHT * CELL_SIZE - 2);

                // Snake
                snakeRef.current.forEach((part, index) => {
                    let color = index === 0 ? '#4ade80' : '#22c55e'; // Bright Green Head, Green Body
                    if (activePowerUp === 'GHOST') color = index === 0 ? '#60a5fa' : '#3b82f6';
                    if (activePowerUp === 'WRAP') color = index === 0 ? '#f472b6' : '#db2777';

                    ctx.fillStyle = color;
                    ctx.shadowBlur = index === 0 ? 15 : 0;
                    ctx.shadowColor = color;
                    
                    // Slightly rounded segments
                    const padding = 1;
                    ctx.fillRect(part.x * CELL_SIZE + padding, part.y * CELL_SIZE + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2);
                    ctx.shadowBlur = 0;
                });

                // Food
                let foodColor = '#facc15'; // Yellow
                let glowColor = '#facc15';
                if (foodRef.current.type === 'GHOST') { foodColor = '#60a5fa'; glowColor = '#60a5fa'; }
                if (foodRef.current.type === 'WRAP') { foodColor = '#f472b6'; glowColor = '#f472b6'; }
                
                ctx.fillStyle = foodColor;
                ctx.shadowBlur = 15;
                ctx.shadowColor = glowColor;
                ctx.beginPath();
                ctx.arc(
                    foodRef.current.x * CELL_SIZE + CELL_SIZE / 2,
                    foodRef.current.y * CELL_SIZE + CELL_SIZE / 2,
                    CELL_SIZE / 3, 0, Math.PI * 2
                );
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [gameState, activePowerUp]);

    // Helpers for UI
    const getDifficultyLevel = () => Math.min(Math.floor(score / 500) + 1, 10);
    const difficultyPercentage = (getDifficultyLevel() / 10) * 100;

    return (
        <div className="min-h-screen bg-[#020604] text-emerald-50 font-mono p-4 lg:p-12 flex items-center justify-center">
            
            {/* Main Dashboard Grid */}
            <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* LEFT: Game Display (colspan 2) */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Header Info */}
                    <div className="flex justify-between items-end border-b border-emerald-900/50 pb-2">
                        <div>
                            <div className="flex items-center gap-2 text-emerald-500 mb-1">
                                <Activity className="w-4 h-4" />
                                <span className="text-xs tracking-widest text-emerald-600 font-bold">SESSION ACTIVE | LEVEL {getDifficultyLevel().toString().padStart(2, '0')}</span>
                            </div>
                            <h1 className="text-3xl font-black italic tracking-tighter text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">
                                NEON_SNAKE
                            </h1>
                        </div>
                        <div className="flex gap-4 text-xs text-emerald-700 font-bold">
                            <span>FPS: 60</span> 
                            <span>PING: 12ms</span> 
                        </div>
                    </div>

                    {/* Canvas Container */}
                    <div 
                        className="relative group rounded-xl overflow-hidden border border-emerald-900 bg-[#020604] shadow-[0_0_50px_rgba(16,185,129,0.05)] touch-none"
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                    >
                        <canvas
                            ref={canvasRef}
                            width={GRID_WIDTH * CELL_SIZE}
                            height={GRID_HEIGHT * CELL_SIZE}
                            className="w-full h-auto block opacity-90"
                        />
                        
                        {/* Scanline Overlay - Pointer Events must pass through to handle swipe, but we put handlers on parent div so it's fine */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 pointer-events-none bg-[length:100%_2px,3px_100%] opacity-20"></div>

                        {/* Start/Paused Screen Overlay */}
                        {(gameState === 'START' || gameState === 'PAUSED') && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-[2px]">
                                <button 
                                    onClick={gameState === 'START' ? resetGame : togglePause}
                                    className="group relative px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-black font-black uppercase tracking-wider text-xl transition-all skew-x-[-10deg] hover:scale-105"
                                >
                                    <div className="skew-x-[10deg] flex items-center gap-3">
                                        <Play className="fill-current w-6 h-6" />
                                        {gameState === 'START' ? 'INITIALIZE' : 'RESUME SESSION'}
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Mobile Controls (Visible on small screens) */}
                    <div className="lg:hidden flex justify-center py-4">
                        <div className="grid grid-cols-3 gap-2">
                             <div />
                             <button
                                className="w-14 h-14 bg-emerald-900/30 border border-emerald-600/50 rounded flex items-center justify-center active:bg-emerald-600/50 transition-colors"
                                onPointerDown={(e) => { e.preventDefault(); handleDirectionChange({ x: 0, y: -1 }); }}
                             >
                                <ChevronUp className="text-emerald-400" />
                             </button>
                             <div />
                             <button
                                className="w-14 h-14 bg-emerald-900/30 border border-emerald-600/50 rounded flex items-center justify-center active:bg-emerald-600/50 transition-colors"
                                onPointerDown={(e) => { e.preventDefault(); handleDirectionChange({ x: -1, y: 0 }); }}
                             >
                                <ChevronLeft className="text-emerald-400" />
                             </button>
                             <button
                                className="w-14 h-14 bg-emerald-900/30 border border-emerald-600/50 rounded flex items-center justify-center active:bg-emerald-600/50 transition-colors"
                                onPointerDown={(e) => { e.preventDefault(); handleDirectionChange({ x: 0, y: 1 }); }}
                             >
                                <ChevronDown className="text-emerald-400" />
                             </button>
                             <button
                                className="w-14 h-14 bg-emerald-900/30 border border-emerald-600/50 rounded flex items-center justify-center active:bg-emerald-600/50 transition-colors"
                                onPointerDown={(e) => { e.preventDefault(); handleDirectionChange({ x: 1, y: 0 }); }}
                             >
                                <ChevronRight className="text-emerald-400" />
                             </button>
                        </div>
                    </div>

                    {/* Controls Hint */}
                    <div className="flex justify-between text-xs text-emerald-800 uppercase font-bold tracking-widest">
                        <div className="flex gap-4">
                            <span className="hidden lg:inline">↹ ARROWS TO MOVE</span>
                            <span className="lg:hidden">SWIPE TO MOVE</span>
                            <span>␣ SPACE TO PAUSE</span>
                        </div>
                        <div className="flex gap-4">
                             {/* Active Powerups Status Display */}
                             <span className={activePowerUp === 'GHOST' ? 'text-blue-400 animate-pulse' : 'opacity-20'}>GHOST_MODE</span>
                             <span className={activePowerUp === 'WRAP' ? 'text-pink-400 animate-pulse' : 'opacity-20'}>WARP_MODE</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Stats Dashboard (colspan 1) */}
                <div className="flex flex-col gap-4">
                    
                    {/* Score Card */}
                    <div className="bg-emerald-950/30 border border-emerald-900/50 p-6 rounded-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
                        <span className="text-xs font-bold text-emerald-700 tracking-widest uppercase mb-2 block">Current Score</span>
                        <div className="text-5xl font-black text-emerald-400 tabular-nums tracking-tight drop-shadow-[0_0_15px_rgba(52,211,153,0.4)]">
                            {score.toLocaleString()}
                        </div>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Activity size={64} />
                        </div>
                    </div>

                    {/* High Score & Level */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-emerald-950/30 border border-emerald-900/50 p-4 rounded-lg flex justify-between items-center">
                            <div>
                                <span className="text-xs font-bold text-emerald-700 tracking-widest uppercase mb-1 block">Best Record</span>
                                <div className="text-2xl font-bold text-emerald-200 tabular-nums">{highScore.toLocaleString()}</div>
                            </div>
                            <Trophy className="text-emerald-600" size={24} />
                        </div>

                        {/* Level Progress */}
                        <div className="bg-emerald-950/30 border border-emerald-900/50 p-4 rounded-lg">
                            <div className="flex justify-between text-xs font-bold text-emerald-700 mb-2">
                                <span>LEVEL DIFFICULTY</span>
                                <span>LVL.{getDifficultyLevel().toString().padStart(2, '0')}</span>
                            </div>
                            <div className="h-2 bg-emerald-950 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981] transition-all duration-500 ease-out"
                                    style={{ width: `${difficultyPercentage}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-auto space-y-3">
                         <button 
                            onClick={gameState === 'PLAYING' ? togglePause : resetGame}
                            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black uppercase rounded text-sm tracking-widest transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2"
                        >
                            {gameState === 'PLAYING' ? <Pause size={16} /> : <Play size={16} />}
                            {gameState === 'PLAYING' ? 'PAUSE GAME' : 'START GAME'}
                        </button>
                        
                        <button className="w-full py-3 bg-emerald-950/50 border border-emerald-900 hover:bg-emerald-900/50 text-emerald-400 font-bold uppercase rounded text-xs tracking-widest transition-all flex items-center justify-center gap-2">
                            <Settings size={14} /> SYSTEM SETTINGS
                        </button>
                    </div>
                </div>
            </div>

            {/* Game Over Modal Overlay */}
            {gameState === 'GAME_OVER' && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-[#0a0f0d] border border-red-900/50 rounded-2xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.2)]">
                        {/* Red Glow Effect */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-red-600 blur-[20px]"></div>
                        
                        <div className="text-center mb-8">
                            <h2 className="text-5xl font-black italic text-red-600 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)] mb-2 animate-pulse glitch-text">
                                GAME OVER
                            </h2>
                            <p className="text-red-900/80 font-bold tracking-widest text-xs uppercase">Your snake hit a wall!</p>
                        </div>

                        {/* Score Comparison */}
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-lg text-center">
                                <div className="text-xs text-red-700 font-bold uppercase mb-1">Final Score</div>
                                <div className="text-3xl font-black text-red-400">{score}</div>
                            </div>
                            <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-lg text-center">
                                <div className="text-xs text-emerald-700 font-bold uppercase mb-1">Your Rank</div>
                                <div className="text-3xl font-black text-emerald-400">#04</div>
                            </div>
                        </div>

                        {/* Mock Leaderboard */}
                        <div className="mb-8 space-y-2">
                            <div className="text-xs font-bold text-gray-600 uppercase mb-2">Top Scores</div>
                            {MOCK_LEADER_BOARD.map((entry, i) => (
                                <div key={i} className="flex justify-between text-sm py-2 border-b border-white/5 text-gray-400">
                                    <span>{i + 1}. {entry.name}</span>
                                    <span className="font-mono text-emerald-600">{entry.score}</span>
                                </div>
                            ))}
                            <div className="flex justify-between text-sm py-2 bg-white/5 rounded px-2 text-white font-bold">
                                <span>3. CURRENT_USER</span>
                                <span className="font-mono text-emerald-400">{score}</span>
                            </div>
                        </div>

                        {/* Footer Controls */}
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={resetGame}
                                className="py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-bold uppercase rounded text-sm transition-colors flex items-center justify-center gap-2"
                            >
                                <RotateCcw size={16} /> Play Again
                            </button>
                            <button className="py-3 bg-white/5 hover:bg-white/10 text-gray-400 font-bold uppercase rounded text-sm transition-colors border border-white/10">
                                Main Menu
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameCanvas;
