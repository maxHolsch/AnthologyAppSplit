import React from 'react';
import { useAnthologyStore } from '@stores';
import './ViewModeToggle.css';

export const ViewModeToggle: React.FC = () => {
    const mapViewMode = useAnthologyStore(state => state.view.mapViewMode);
    const setMapViewMode = useAnthologyStore(state => state.setMapViewMode);
    const setRailMode = useAnthologyStore(state => state.setRailMode);

    const handleToggle = () => {
        if (mapViewMode === 'narrative') {
            setMapViewMode('question');
            setRailMode('conversations'); // Sync rail to questions view
        } else {
            setMapViewMode('narrative');
            setRailMode('narratives'); // Sync rail to narratives view
        }
    };

    const isQuestionView = mapViewMode === 'question';

    return (
        <div className="view-mode-control">
            <button
                className={`view-mode-toggle ${isQuestionView ? 'question-mode' : 'narrative-mode'}`}
                onClick={handleToggle}
                title={isQuestionView ? "Switch to Narrative View" : "Switch to Question View"}
            >
                <span className="view-mode-label">
                    {isQuestionView ? 'Questions' : 'Narratives'}
                </span>
                <span className="view-mode-indicator">
                    {isQuestionView ? '?' : ''}
                </span>
            </button>
        </div>
    );
};
