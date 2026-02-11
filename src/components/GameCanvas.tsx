import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Zap, Ghost, Globe } from 'lucide-react';

// --- Constants ---
const CELL_SIZE = 20;
const GRID_WIDTH = 30; // 600px
const GRID_HEIGHT = 20; // 400px
const INITIAL_SPEED = 100; // ms per move
const SPEED_BOOST_FACTOR = 0.85; // 15% faster (smaller interval)
const POWERUP_DURATION = 7000; // 7s

type Point = { x: number; y: number };
type GameState = 'START' | 'PLAYING' | 'GAME_OVER';
type PowerUpType = 'GHOST' | 'WRAP' | null;
type FoodType = 'NORMAL' | 'GHOST' | 'WRAP';

const GameCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gameState, setGameState] = useState<GameState>('START');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem('neon-snake-high-score') || '0'));
    const [activePowerUp, setActivePowerUp] = useState<PowerUpType>(null);

    // Game Mutable State (Ref for performance in loop)
    const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }]);
    const directionRef = useRef<Point>({ x: 1, y: 0 }); // Moving right
    const nextDirectionRef = useRef<Point>({ x: 1, y: 0 });
    const foodRef = useRef<{ x: number; y: number; type: FoodType }>({ x: 15, y: 10, type: 'NORMAL' });
    const speedRef = useRef(INITIAL_SPEED);
    const lastRenderTimeRef = useRef(0);
    const powerUpTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // --- Sound Effects (Simple Oscillator Fallback for clean "No Assets" approach) ---
    const playSound = useCallback((type: 'eat' | 'die' | 'powerup') => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'eat') {
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'die') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.3);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'powerup') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(800, now + 0.1);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        }
    }, []);

    // --- Game Logic ---
    const spawnFood = () => {
        let type: FoodType = 'NORMAL';
        const rand = Math.random();
        if (rand > 0.85) type = 'GHOST'; // 15% chance
        else if (rand > 0.70) type = 'WRAP';  // 15% chance
        
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
        
        powerUpTimeoutRef.current = setTimeout(() => {
            setActivePowerUp(null);
        }, POWERUP_DURATION);
    };

    const resetGame = () => {
        snakeRef.current = [{ x: 10, y: 10 }];
        directionRef.current = { x: 1, y: 0 };
        nextDirectionRef.current = { x: 1, y: 0 };
        setScore(0);
        setGameState('PLAYING');
        speedRef.current = INITIAL_SPEED;
        setActivePowerUp(null);
        spawnFood();
        if (powerUpTimeoutRef.current) clearTimeout(powerUpTimeoutRef.current);
    };

    const gameOver = () => {
        playSound('die');
        setGameState('GAME_OVER');
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('neon-snake-high-score', score.toString());
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#0ff', '#f0f', '#ff0'] // Neon colors
            });
        }
    };

    // --- Controls ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (gameState !== 'PLAYING') return;
            
            const { key } = e;
            const currentDir = directionRef.current;

            // Prevent reversing direction
            if (key === 'ArrowUp' && currentDir.y === 0) nextDirectionRef.current = { x: 0, y: -1 };
            if (key === 'ArrowDown' && currentDir.y === 0) nextDirectionRef.current = { x: 0, y: 1 };
            if (key === 'ArrowLeft' && currentDir.x === 0) nextDirectionRef.current = { x: -1, y: 0 };
            if (key === 'ArrowRight' && currentDir.x === 0) nextDirectionRef.current = { x: 1, y: 0 };
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState]);

    // --- Game Loop ---
    useEffect(() => {
        if (gameState !== 'PLAYING') return;

        let animationFrameId: number;

        const loop = (time: number) => {
            const timeSinceLastRender = time - lastRenderTimeRef.current;
            
            // Move update
            if (timeSinceLastRender > speedRef.current) {
                lastRenderTimeRef.current = time;
                
                // Update direction
                directionRef.current = nextDirectionRef.current;
                const head = snakeRef.current[0];
                let newHead = {
                    x: head.x + directionRef.current.x,
                    y: head.y + directionRef.current.y
                };

                // Collision: Walls
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

                // Collision: Self
                if (activePowerUp !== 'GHOST') {
                    for (let part of snakeRef.current) {
                        if (newHead.x === part.x && newHead.y === part.y) {
                            gameOver();
                            return;
                        }
                    }
                }

                // Move Snake
                const newSnake = [newHead, ...snakeRef.current];
                
                // Check Food
                if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
                    playSound('eat');
                    setScore(s => s + 10);
                    
                    // Trigger Powerups
                    if (foodRef.current.type === 'GHOST') activatePowerUp('GHOST');
                    if (foodRef.current.type === 'WRAP') activatePowerUp('WRAP');

                    spawnFood();
                    // Don't pop tail (grow)
                } else {
                    newSnake.pop(); // Remove tail
                }

                snakeRef.current = newSnake;
            }

            // Draw
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) {
                // Clear
                ctx.fillStyle = '#050505'; // Dark bg
                ctx.fillRect(0, 0, GRID_WIDTH * CELL_SIZE, GRID_HEIGHT * CELL_SIZE);

                // Grid (Subtle)
                ctx.strokeStyle = '#111';
                ctx.lineWidth = 1;
                for (let i = 0; i <= GRID_WIDTH; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * CELL_SIZE, 0);
                    ctx.lineTo(i * CELL_SIZE, GRID_HEIGHT * CELL_SIZE);
                    ctx.stroke();
                }
                for (let j = 0; j <= GRID_HEIGHT; j++) {
                    ctx.beginPath();
                    ctx.moveTo(0, j * CELL_SIZE);
                    ctx.lineTo(GRID_WIDTH * CELL_SIZE, j * CELL_SIZE);
                    ctx.stroke();
                }

                // Draw Snake
                snakeRef.current.forEach((part, index) => {
                    let color = index === 0 ? '#0ff' : `rgba(0, 255, 255, ${1 - index / snakeRef.current.length})`; 
                    
                    if (activePowerUp === 'GHOST') {
                        color = index === 0 ? '#60a5fa' : `rgba(96, 165, 250, 0.4)`; // Blue ghost
                    } else if (activePowerUp === 'WRAP') {
                        color = index === 0 ? '#f472b6' : `rgba(244, 114, 182, ${1 - index / snakeRef.current.length})`; // Pink wrap
                    }

                    ctx.fillStyle = color;
                    ctx.shadowBlur = index === 0 ? 15 : 5;
                    ctx.shadowColor = color;
                    ctx.fillRect(part.x * CELL_SIZE + 1, part.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
                    ctx.shadowBlur = 0; // Reset
                });

                // Draw Food (Token)
                let foodColor = '#ff0'; // Yellow Standard
                if (foodRef.current.type === 'GHOST') foodColor = '#3b82f6'; // Blue
                if (foodRef.current.type === 'WRAP') foodColor = '#ec4899'; // Pink

                ctx.fillStyle = foodColor;
                ctx.shadowBlur = 10;
                ctx.shadowColor = foodColor;
                ctx.beginPath();
                const foodX = foodRef.current.x * CELL_SIZE + CELL_SIZE / 2;
                const foodY = foodRef.current.y * CELL_SIZE + CELL_SIZE / 2;
                ctx.arc(foodX, foodY, CELL_SIZE / 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [gameState, activePowerUp]); // activePowerUp dependency ensures render updates immediately

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-mono">
            {/* Header */}
            <div className="mb-4 flex gap-8 items-center z-10">
                <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <span className="text-xl">HI: {highScore}</span>
                </div>
                <div className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
                    NEON SNAKE
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                    <Zap className="w-5 h-5" />
                    <span className="text-xl">SCORE: {score}</span>
                </div>
            </div>

            {/* Power Up Indicators */}
            <div className="flex gap-4 mb-4 h-8">
                {activePowerUp === 'GHOST' && (
                    <div className="flex items-center gap-2 text-blue-400 animate-pulse bg-blue-900/30 px-3 py-1 rounded-full border border-blue-500/50">
                        <Ghost className="w-4 h-4" /> GHOST MODE (NO CLIP)
                    </div>
                )}
                {activePowerUp === 'WRAP' && (
                    <div className="flex items-center gap-2 text-pink-400 animate-pulse bg-pink-900/30 px-3 py-1 rounded-full border border-pink-500/50">
                        <Globe className="w-4 h-4" /> WARP MODE (WALL PASS)
                    </div>
                )}
            </div>

            {/* Game Container */}
            <div className={`relative group transition-all duration-300 ${activePowerUp === 'GHOST' ? 'shadow-[0_0_30px_rgba(59,130,246,0.5)]' : activePowerUp === 'WRAP' ? 'shadow-[0_0_30px_rgba(236,72,153,0.5)]' : ''}`}>
                <canvas
                    ref={canvasRef}
                    width={GRID_WIDTH * CELL_SIZE}
                    height={GRID_HEIGHT * CELL_SIZE}
                    className="border-4 border-gray-800 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.8)] bg-black/50 backdrop-blur-sm"
                />
                
                {/* Overlays */}
                {gameState === 'START' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
                        <h1 className="text-5xl font-bold mb-4 text-cyan-400 animate-pulse">PRESS START</h1>
                        <button 
                            onClick={resetGame}
                            className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-bold rounded shadow-[0_0_15px_#06b6d4] transition-all transform hover:scale-105"
                        >
                            INITIATE PROTOCOL
                        </button>
                    </div>
                )}

                {gameState === 'GAME_OVER' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-lg z-20">
                        <h2 className="text-5xl font-bold text-red-500 mb-2 glitch-text">SYSTEM FAILURE</h2>
                        <p className="text-xl mb-6 text-gray-300">SCORE: {score}</p>
                        <button 
                            onClick={resetGame}
                            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded shadow-[0_0_15px_#9333ea] transition-all transform hover:scale-105"
                        >
                            REBOOT
                        </button>
                    </div>
                )}
            </div>

             {/* Helper Text */}
             <div className="mt-6 flex gap-6 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></span> GHOST (Pass Self)
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-pink-500 shadow-[0_0_10px_#ec4899]"></span> WARP (Pass Walls)
                </div>
            </div>
        </div>
    );
};

export default GameCanvas;
