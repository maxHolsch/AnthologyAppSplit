import React from 'react';
import { SyncIcon, AsyncAudioIcon, AsyncTextIcon } from '@components/Icons/NodeIcons';
import './Legend.css';

export const Legend: React.FC = () => {
    return (
        <div className="legend">
            <div className="legend-item">
                <div className="legend-icon">
                    <SyncIcon color="#000000" size={14} />
                </div>
                <span className="legend-label">Live excerpts</span>
            </div>
            <div className="legend-item">
                <div className="legend-icon">
                    <AsyncAudioIcon color="#000000" size={14} />
                </div>
                <span className="legend-label">Voice responses</span>
            </div>
            <div className="legend-item">
                <div className="legend-icon">
                    <AsyncTextIcon color="#000000" size={14} />
                </div>
                <span className="legend-label">Text responses</span>
            </div>
        </div>
    );
};
