/**
 * useGalleryData - Hook for fetching gallery data from the API
 *
 * Fetches gallery photos for event pages with loading, error, and success states.
 * Supports category filtering and automatic cleanup on unmount.
 *
 * Usage:
 *   import { useGalleryData } from '../hooks/useGalleryData';
 *
 *   function GalleryPageContent() {
 *     const { data, loading, error, refetch } = useGalleryData({
 *       year: '2025',
 *       category: 'workshops'
 *     });
 *
 *     if (loading) return <LoadingSpinner />;
 *     if (error) return <ErrorMessage message={error} />;
 *
 *     return <GalleryGrid photos={data.photos} />;
 *   }
 *
 * @param {Object} options
 * @param {string} options.year - Event year (e.g., '2025')
 * @param {string} [options.category] - Category filter ('workshops' | 'socials')
 * @param {string} [options.eventId] - Event identifier for filtering
 * @param {boolean} [options.enabled=true] - Whether to fetch data
 *
 * @returns {Object} {
 *   data: { photos: [], stats: {} } | null,
 *   loading: boolean,
 *   error: string | null,
 *   refetch: () => void
 * }
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Transform raw API response to normalized gallery data
 * @param {Object} rawData - Raw API response
 * @returns {Object} Normalized gallery data
 */
function transformGalleryData(rawData) {
    if (!rawData) {
        return { photos: [], stats: {} };
    }

    // Handle different API response shapes
    const photos = rawData.photos || rawData.images || rawData.data || [];
    const stats = rawData.stats || {};

    return {
        photos: photos.map((photo, index) => ({
            id: photo.id || `photo-${index}`,
            src: photo.src || photo.url || photo.imageUrl,
            thumbnail: photo.thumbnail || photo.src || photo.url,
            alt: photo.alt || photo.description || `Gallery photo ${index + 1}`,
            category: photo.category || 'general',
            width: photo.width || null,
            height: photo.height || null,
        })),
        stats: {
            total: stats.total || photos.length,
            categories: stats.categories || {},
            ...stats,
        },
    };
}

export function useGalleryData({
    year,
    category,
    eventId,
    enabled = true,
} = {}) {
    const [state, setState] = useState({
        data: null,
        loading: enabled,
        error: null,
    });

    // Track if component is mounted
    const mountedRef = useRef(true);

    // Track the current request to prevent stale responses
    const requestIdRef = useRef(0);

    const fetchGallery = useCallback(async () => {
        if (!enabled || !year) {
            setState(prev => ({ ...prev, loading: false }));
            return;
        }

        // Increment request ID to track current request
        const currentRequestId = ++requestIdRef.current;

        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            // Build query parameters
            const params = new URLSearchParams();
            params.append('year', year);

            if (category) {
                params.append('category', category);
            }

            if (eventId) {
                params.append('event', eventId);
            }

            const response = await fetch(`/api/gallery?${params.toString()}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            // Check if this is still the current request
            if (requestIdRef.current !== currentRequestId || !mountedRef.current) {
                return;
            }

            if (!response.ok) {
                throw new Error(`Failed to load gallery: ${response.status} ${response.statusText}`);
            }

            const rawData = await response.json();
            const transformedData = transformGalleryData(rawData);

            if (mountedRef.current && requestIdRef.current === currentRequestId) {
                setState({
                    data: transformedData,
                    loading: false,
                    error: null,
                });
            }
        } catch (err) {
            // Check if this is still the current request and component is mounted
            if (mountedRef.current && requestIdRef.current === currentRequestId) {
                const errorMessage = err.name === 'AbortError'
                    ? 'Request was cancelled'
                    : err.message || 'Failed to load gallery data';

                setState(prev => ({
                    ...prev,
                    loading: false,
                    error: errorMessage,
                }));
            }
        }
    }, [year, category, eventId, enabled]);

    // Initial fetch and refetch on dependency changes
    useEffect(() => {
        mountedRef.current = true;
        fetchGallery();

        return () => {
            mountedRef.current = false;
        };
    }, [fetchGallery]);

    // Expose refetch function
    const refetch = useCallback(() => {
        fetchGallery();
    }, [fetchGallery]);

    return {
        data: state.data,
        loading: state.loading,
        error: state.error,
        refetch,
    };
}

/**
 * useGalleryCategories - Hook for fetching available gallery categories
 *
 * @param {string} year - Event year
 * @returns {Object} { categories: string[], loading: boolean, error: string | null }
 */
export function useGalleryCategories(year) {
    const [state, setState] = useState({
        categories: [],
        loading: true,
        error: null,
    });

    useEffect(() => {
        if (!year) {
            setState({ categories: [], loading: false, error: null });
            return;
        }

        let mounted = true;

        async function fetchCategories() {
            try {
                const response = await fetch(`/api/gallery/years?year=${year}`);

                if (!mounted) return;

                if (!response.ok) {
                    throw new Error('Failed to load categories');
                }

                const data = await response.json();
                const categories = data.categories || [];

                if (mounted) {
                    setState({
                        categories,
                        loading: false,
                        error: null,
                    });
                }
            } catch (err) {
                if (mounted) {
                    setState(prev => ({
                        ...prev,
                        loading: false,
                        error: err.message,
                    }));
                }
            }
        }

        fetchCategories();

        return () => {
            mounted = false;
        };
    }, [year]);

    return state;
}
