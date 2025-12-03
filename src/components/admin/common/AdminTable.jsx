/**
 * AdminTable Component
 *
 * Reusable data table component for admin pages.
 */

import React from 'react';

/**
 * AdminTable - Data table with sorting and loading states
 *
 * @param {Object} props
 * @param {Array} props.columns - Column definitions
 * @param {Array} props.data - Table data
 * @param {boolean} [props.loading] - Loading state
 * @param {string} [props.emptyMessage] - Message when no data
 * @param {Function} [props.onRowClick] - Row click handler
 * @param {string} [props.className] - Additional CSS classes
 */
export default function AdminTable({
    columns,
    data,
    loading = false,
    emptyMessage = 'No data available',
    onRowClick,
    className = '',
}) {
    if (loading) {
        return (
            <div className="admin-loading">
                Loading data...
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="admin-empty-state">
                <p>{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className={`admin-table-container ${className}`}>
            <table className="admin-table">
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th
                                key={column.key}
                                style={{
                                    width: column.width,
                                    textAlign: column.align || 'left',
                                }}
                            >
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, rowIndex) => (
                        <tr
                            key={row.id || rowIndex}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                            style={onRowClick ? { cursor: 'pointer' } : undefined}
                        >
                            {columns.map((column) => (
                                <td
                                    key={column.key}
                                    style={{ textAlign: column.align || 'left' }}
                                >
                                    {column.render
                                        ? column.render(row[column.key], row)
                                        : row[column.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
