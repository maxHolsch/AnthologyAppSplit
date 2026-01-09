import { useEffect, useState } from 'react';
import { useAnthologyStore } from '@stores';
import type { Notification as NotificationType } from '@types';
import './Notification.css';

const NotificationIcon = ({ type }: { type: NotificationType['type'] }) => {
    switch (type) {
        case 'warning':
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            );
        case 'error':
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
            );
        case 'success':
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            );
        default:
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
            );
    }
};

export const NotificationItem = ({ notification, onDismiss }: { notification: NotificationType, onDismiss: (id: string) => void }) => {
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        if (notification.duration) {
            const timer = setTimeout(() => {
                handleDismiss();
            }, notification.duration);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const handleDismiss = () => {
        setIsLeaving(true);
        setTimeout(() => {
            onDismiss(notification.id);
        }, 300); // Match animation duration
    };

    return (
        <div className={`notification notification-${notification.type} ${isLeaving ? 'notification-leaving' : ''}`}>
            <div className="notification-icon">
                <NotificationIcon type={notification.type} />
            </div>
            <div className="notification-content">
                <div className="notification-message">{notification.message}</div>
            </div>
            <button className="notification-close" onClick={handleDismiss} aria-label="Dismiss">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
};

export const NotificationContainer = () => {
    const notifications = useAnthologyStore(state => state.data.notifications);
    const dismissNotification = useAnthologyStore(state => state.dismissNotification);

    if (notifications.length === 0) return null;

    return (
        <div className="notification-container">
            {notifications.map(notification => (
                <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onDismiss={dismissNotification}
                />
            ))}
        </div>
    );
};
