/**
 * useCart - Custom hook for accessing cart context
 *
 * Provides convenient access to cart state and methods.
 * Must be used within a CartProvider.
 *
 * Returns:
 *   - cart: Current cart state (tickets, donations, metadata, totals)
 *   - isInitialized: Whether cart has been initialized
 *   - isLoading: Whether cart is still loading
 *   - addTicket: Function to add/increment ticket
 *   - removeTicket: Function to remove ticket
 *   - updateTicketQuantity: Function to update ticket quantity
 *   - addDonation: Function to add donation
 *   - removeDonation: Function to remove donation
 *   - clear: Function to clear entire cart
 *
 * Usage:
 *   function TicketCard() {
 *     const { cart, addTicket, isInitialized } = useCart();
 *
 *     if (!isInitialized) {
 *       return <div>Loading cart...</div>;
 *     }
 *
 *     return (
 *       <div>
 *         <p>Items: {cart?.totals?.itemCount || 0}</p>
 *         <button onClick={() => addTicket({
 *           ticketType: 'full-pass',
 *           quantity: 1,
 *           price: 75,
 *           name: 'Full Pass'
 *         })}>
 *           Add to Cart
 *         </button>
 *       </div>
 *     );
 *   }
 */

import { useContext } from 'react';
import { CartContext } from '../contexts/CartContext.jsx';

export function useCart() {
    const context = useContext(CartContext);

    if (context === null) {
        throw new Error('useCart must be used within a CartProvider');
    }

    return context;
}
