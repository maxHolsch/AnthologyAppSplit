/**
 * Services Barrel Export
 * Central export point for all service modules
 */

// API client for REST API calls
export * from './apiClient';

// Core services (now using REST API)
export * from './anthologyService';
export * from './conversationService';
export * from './questionService';
export * from './narrativeService';
export * from './responseService';
export * from './speakerService';
export * from './graphDataService';

// Services that still use Supabase directly (for file uploads and complex writes)
// These will be migrated to REST API in future iterations
export * from './recordingService';
export * from './adminService';
export * from './conversationUploadService';

// Keep supabaseClient export for backward compatibility with services that still need it
export * from './supabaseClient';
