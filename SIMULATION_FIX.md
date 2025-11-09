# Simulation Fix: Reheating After Pre-Warm

## Problem
The D3 force simulation is over-cooled during pre-warming (175 ticks), causing alpha to drop below alphaMin threshold (0.001) before React renders. This makes nodes appear static and prevents collision resolution.

## Root Cause
- Pre-warm: 175 ticks with alphaDecay(0.01)
- Alpha after 175 ticks: ~0.00005
- Alpha min threshold: 0.001
- Result: Simulation auto-stops, tick events never fire

## Solution
After pre-warming, reheat simulation to alpha=1 and restart.

## Code Change
File: `src/stores/VisualizationStore.ts`
Line: After line 174

Add:
```typescript
// Reheat simulation after pre-warming to ensure it runs when rendered
simulation.alpha(1).restart();
```

This ensures:
- Simulation is running when React renders
- Tick events fire continuously
- Collision forces resolve overlaps
- Nodes animate on screen
