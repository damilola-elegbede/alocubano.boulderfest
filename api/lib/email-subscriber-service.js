/**
 * Email Subscriber Service
 * Handles database operations for email subscribers
 */

import { getBrevoService } from './brevo-service.js';
import { createHmac } from 'crypto';

class EmailSubscriberService {
    constructor() {
        this.brevoService = getBrevoService();
    }
    
    /**
     * Get database connection (placeholder - implement based on your DB setup)
     */
    async getDb() {
        // This would be replaced with your actual database connection
        // For now, we'll simulate database operations
        throw new Error('Database connection not implemented - please configure your database');
    }
    
    /**
     * Create new subscriber
     */
    async createSubscriber(subscriberData) {
        const {
            email,
            firstName,
            lastName,
            phone,
            status = 'pending',
            listIds = [],
            attributes = {},
            consentSource = 'website',
            consentIp,
            verificationToken
        } = subscriberData;
        
        try {
            // Create in Brevo first
            const brevoResult = await this.brevoService.subscribeToNewsletter({
                email,
                firstName,
                lastName,
                phone,
                source: consentSource,
                attributes
            });
            
            // Then create in database
            const query = `
                INSERT INTO email_subscribers (
                    email, first_name, last_name, phone, status, brevo_contact_id,
                    list_ids, attributes, consent_date, consent_source, consent_ip,
                    verification_token
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
            `;
            
            const values = [
                email,
                firstName || null,
                lastName || null,
                phone || null,
                status,
                brevoResult.id || null,
                listIds,
                JSON.stringify(attributes),
                new Date(),
                consentSource,
                consentIp || null,
                verificationToken || null
            ];
            
            // Simulate database operation
            const subscriber = {
                id: Math.floor(Math.random() * 10000),
                email,
                first_name: firstName,
                last_name: lastName,
                phone,
                status,
                brevo_contact_id: brevoResult.id,
                list_ids: listIds,
                attributes,
                consent_date: new Date(),
                consent_source: consentSource,
                consent_ip: consentIp,
                verification_token: verificationToken,
                created_at: new Date(),
                updated_at: new Date()
            };
            
            // Log the event
            await this.logEmailEvent(subscriber.id, 'subscribed', {
                source: consentSource,
                lists: listIds
            });
            
            // Audit log
            await this.auditLog('email_subscribers', subscriber.id, 'create', 'system', 'api', {
                email,
                source: consentSource
            }, consentIp);
            
            return subscriber;
            
        } catch (error) {
            if (error.message.includes('duplicate key value')) {
                // Handle duplicate email
                throw new Error('Email address is already subscribed');
            }
            throw error;
        }
    }
    
    /**
     * Get subscriber by email
     */
    async getSubscriberByEmail(email) {
        const query = 'SELECT * FROM email_subscribers WHERE email = $1';
        
        // Simulate database operation
        return {
            id: 1,
            email,
            first_name: null,
            last_name: null,
            phone: null,
            status: 'active',
            brevo_contact_id: '123',
            list_ids: [1],
            attributes: {},
            consent_date: new Date(),
            consent_source: 'website',
            consent_ip: null,
            verification_token: null,
            verified_at: new Date(),
            unsubscribed_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };
    }
    
    /**
     * Update subscriber
     */
    async updateSubscriber(email, updateData) {
        const {
            firstName,
            lastName,
            phone,
            status,
            listIds,
            attributes,
            verificationToken,
            verifiedAt,
            unsubscribedAt
        } = updateData;
        
        const updates = [];
        const values = [];
        let paramCount = 1;
        
        if (firstName !== undefined) {
            updates.push(`first_name = $${paramCount++}`);
            values.push(firstName);
        }
        if (lastName !== undefined) {
            updates.push(`last_name = $${paramCount++}`);
            values.push(lastName);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${paramCount++}`);
            values.push(phone);
        }
        if (status !== undefined) {
            updates.push(`status = $${paramCount++}`);
            values.push(status);
        }
        if (listIds !== undefined) {
            updates.push(`list_ids = $${paramCount++}`);
            values.push(listIds);
        }
        if (attributes !== undefined) {
            updates.push(`attributes = $${paramCount++}`);
            values.push(JSON.stringify(attributes));
        }
        if (verificationToken !== undefined) {
            updates.push(`verification_token = $${paramCount++}`);
            values.push(verificationToken);
        }
        if (verifiedAt !== undefined) {
            updates.push(`verified_at = $${paramCount++}`);
            values.push(verifiedAt);
        }
        if (unsubscribedAt !== undefined) {
            updates.push(`unsubscribed_at = $${paramCount++}`);
            values.push(unsubscribedAt);
        }
        
        if (updates.length === 0) {
            throw new Error('No update data provided');
        }
        
        values.push(email);
        
        const query = `
            UPDATE email_subscribers 
            SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE email = $${paramCount}
            RETURNING *
        `;
        
        // Simulate database operation
        const updatedSubscriber = await this.getSubscriberByEmail(email);
        Object.assign(updatedSubscriber, updateData);
        
        // Audit log
        await this.auditLog('email_subscribers', updatedSubscriber.id, 'update', 'system', 'api', updateData);
        
        return updatedSubscriber;
    }
    
    /**
     * Unsubscribe user
     */
    async unsubscribeSubscriber(email, reason = 'user_request') {
        try {
            // Update in Brevo
            await this.brevoService.unsubscribeContact(email);
            
            // Update in database
            const subscriber = await this.updateSubscriber(email, {
                status: 'unsubscribed',
                unsubscribedAt: new Date()
            });
            
            // Log the event
            await this.logEmailEvent(subscriber.id, 'unsubscribed', { reason });
            
            return subscriber;
            
        } catch (error) {
            if (error.message.includes('contact_not_exist')) {
                // Still update local database
                return this.updateSubscriber(email, {
                    status: 'unsubscribed',
                    unsubscribedAt: new Date()
                });
            }
            throw error;
        }
    }
    
    /**
     * Verify subscriber email
     */
    async verifySubscriber(email, token) {
        const subscriber = await this.getSubscriberByEmail(email);
        
        if (!subscriber) {
            throw new Error('Subscriber not found');
        }
        
        if (subscriber.verification_token !== token) {
            throw new Error('Invalid verification token');
        }
        
        if (subscriber.verified_at) {
            throw new Error('Email already verified');
        }
        
        // Update subscriber as verified
        const verifiedSubscriber = await this.updateSubscriber(email, {
            status: 'active',
            verifiedAt: new Date(),
            verificationToken: null
        });
        
        // Log the event
        await this.logEmailEvent(subscriber.id, 'verified', {});
        
        return verifiedSubscriber;
    }
    
    /**
     * Log email event
     */
    async logEmailEvent(subscriberId, eventType, eventData, brevoEventId = null) {
        const query = `
            INSERT INTO email_events (subscriber_id, event_type, event_data, brevo_event_id, occurred_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const values = [
            subscriberId,
            eventType,
            JSON.stringify(eventData),
            brevoEventId,
            new Date()
        ];
        
        // Simulate database operation
        return {
            id: Math.floor(Math.random() * 10000),
            subscriber_id: subscriberId,
            event_type: eventType,
            event_data: eventData,
            brevo_event_id: brevoEventId,
            occurred_at: new Date(),
            created_at: new Date()
        };
    }
    
    /**
     * Audit log
     */
    async auditLog(entityType, entityId, action, actorType, actorId, changes, ipAddress = null, userAgent = null) {
        const query = `
            INSERT INTO email_audit_log (entity_type, entity_id, action, actor_type, actor_id, changes, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        
        const values = [
            entityType,
            entityId,
            action,
            actorType,
            actorId,
            JSON.stringify(changes),
            ipAddress,
            userAgent
        ];
        
        // Simulate database operation
        return {
            id: Math.floor(Math.random() * 10000),
            entity_type: entityType,
            entity_id: entityId,
            action,
            actor_type: actorType,
            actor_id: actorId,
            changes,
            ip_address: ipAddress,
            user_agent: userAgent,
            created_at: new Date()
        };
    }
    
    /**
     * Get subscriber statistics
     */
    async getSubscriberStats() {
        const query = `
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'unsubscribed') as unsubscribed,
                COUNT(*) FILTER (WHERE status = 'bounced') as bounced
            FROM email_subscribers
        `;
        
        // Simulate database operation
        return {
            total: 1250,
            active: 1100,
            pending: 50,
            unsubscribed: 75,
            bounced: 25
        };
    }
    
    /**
     * Get recent events
     */
    async getRecentEvents(limit = 100) {
        const query = `
            SELECT e.*, s.email
            FROM email_events e
            JOIN email_subscribers s ON e.subscriber_id = s.id
            ORDER BY e.occurred_at DESC
            LIMIT $1
        `;
        
        // Simulate database operation
        return [
            {
                id: 1,
                subscriber_id: 1,
                event_type: 'subscribed',
                event_data: { source: 'website' },
                brevo_event_id: null,
                occurred_at: new Date(),
                email: 'test@example.com'
            }
        ];
    }
    
    /**
     * Process Brevo webhook event
     */
    async processWebhookEvent(webhookData) {
        const processedEvent = await this.brevoService.processWebhookEvent(webhookData);
        
        // Find subscriber by email
        let subscriber;
        try {
            subscriber = await this.getSubscriberByEmail(processedEvent.email);
        } catch (error) {
            console.warn(`Subscriber not found for webhook event: ${processedEvent.email}`);
            return null;
        }
        
        // Log the event
        await this.logEmailEvent(
            subscriber.id,
            processedEvent.eventType,
            processedEvent.data,
            webhookData.id
        );
        
        // Update subscriber status if needed
        if (processedEvent.eventType === 'hard_bounce' || processedEvent.eventType === 'spam') {
            await this.updateSubscriber(processedEvent.email, { status: 'bounced' });
        } else if (processedEvent.eventType === 'unsubscribed') {
            await this.updateSubscriber(processedEvent.email, { 
                status: 'unsubscribed',
                unsubscribedAt: processedEvent.occurredAt
            });
        }
        
        return processedEvent;
    }
    
    /**
     * Sync with Brevo (reconcile differences)
     */
    async syncWithBrevo() {
        // This would implement a sync process to reconcile
        // differences between local database and Brevo
        const stats = await this.brevoService.getAllListStats();
        return stats;
    }
    
    /**
     * Generate unsubscribe token
     */
    generateUnsubscribeToken(email) {
        const secret = process.env.UNSUBSCRIBE_SECRET || 'default-secret';
        return createHmac('sha256', secret)
            .update(email)
            .digest('hex');
    }
    
    /**
     * Validate unsubscribe token
     */
    validateUnsubscribeToken(email, token) {
        const expectedToken = this.generateUnsubscribeToken(email);
        return token === expectedToken;
    }
}

// Export singleton instance
let emailSubscriberServiceInstance = null;

export function getEmailSubscriberService() {
    if (!emailSubscriberServiceInstance) {
        emailSubscriberServiceInstance = new EmailSubscriberService();
    }
    return emailSubscriberServiceInstance;
}

export { EmailSubscriberService };