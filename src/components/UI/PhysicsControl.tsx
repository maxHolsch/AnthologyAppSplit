
import React from 'react';
import { useVisualizationStore } from '@stores';
import './PhysicsControl.css';

export const PhysicsControl: React.FC = () => {
    const isPhysicsEnabled = useVisualizationStore(state => state.isPhysicsEnabled);
    const togglePhysics = useVisualizationStore(state => state.togglePhysics);

    return (
        <div className="physics-control">
            <button
                className={`physics-toggle ${isPhysicsEnabled ? 'active' : ''}`}
                onClick={togglePhysics}
                title={isPhysicsEnabled ? "Lock physics (keep nodes static)" : "Unlock physics (allow fluid movement)"}
            >
                {isPhysicsEnabled ? '🔒 Lock Physics' : '🔓 Unlock Physics'}
            </button>
        </div>
    );
};
