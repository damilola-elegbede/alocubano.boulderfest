/**
 * AdminPagination Component
 *
 * Pagination controls for admin data tables.
 */

import React from 'react';

/**
 * AdminPagination - Pagination controls
 *
 * @param {Object} props
 * @param {number} props.currentPage - Current page (1-indexed)
 * @param {number} props.totalPages - Total number of pages
 * @param {number} props.totalItems - Total number of items
 * @param {number} props.pageSize - Items per page
 * @param {Function} props.onPageChange - Page change handler
 * @param {string} [props.className] - Additional CSS classes
 */
export default function AdminPagination({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    className = '',
}) {
    if (totalPages <= 1) {
        return null;
    }

    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    // Generate page numbers to display
    const getPageNumbers = () => {
        const pages = [];
        const showPages = 5; // Number of page buttons to show
        let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
        let endPage = Math.min(totalPages, startPage + showPages - 1);

        // Adjust if at the end
        if (endPage - startPage < showPages - 1) {
            startPage = Math.max(1, endPage - showPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        return pages;
    };

    const pageNumbers = getPageNumbers();

    return (
        <div className={`admin-pagination ${className}`}>
            <div className="admin-pagination-info">
                Showing {startItem}-{endItem} of {totalItems} items
            </div>
            <div className="admin-pagination-controls">
                {/* First page */}
                <button
                    className="admin-btn admin-btn-sm"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    aria-label="First page"
                    type="button"
                >
                    ««
                </button>

                {/* Previous page */}
                <button
                    className="admin-btn admin-btn-sm"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                    type="button"
                >
                    «
                </button>

                {/* Page numbers */}
                {pageNumbers[0] > 1 && (
                    <span className="admin-pagination-ellipsis">...</span>
                )}

                {pageNumbers.map((page) => (
                    <button
                        key={page}
                        className={`admin-btn admin-btn-sm ${
                            page === currentPage ? 'admin-btn-primary' : ''
                        }`}
                        onClick={() => onPageChange(page)}
                        aria-label={`Page ${page}`}
                        aria-current={page === currentPage ? 'page' : undefined}
                        type="button"
                    >
                        {page}
                    </button>
                ))}

                {pageNumbers[pageNumbers.length - 1] < totalPages && (
                    <span className="admin-pagination-ellipsis">...</span>
                )}

                {/* Next page */}
                <button
                    className="admin-btn admin-btn-sm"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                    type="button"
                >
                    »
                </button>

                {/* Last page */}
                <button
                    className="admin-btn admin-btn-sm"
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    aria-label="Last page"
                    type="button"
                >
                    »»
                </button>
            </div>
        </div>
    );
}
