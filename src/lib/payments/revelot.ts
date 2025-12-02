/**
 * NeXifyAI Builder - REVELOT Business Integration
 * Zahlungssystem für Subscriptions
 */

import { supabase } from '../supabase/client';
import type { Subscription } from '../supabase/schema';

// REVELOT Business API Configuration
const REVELOT_API_URL = import.meta.env.VITE_REVELOT_API_URL || 'https://api.revelot.com/v1';
const REVELOT_API_KEY = import.meta.env.VITE_REVELOT_API_KEY;

/**
 * Führt einen REVELOT API-Call mit Retry-Logik durch
 */
async function revelotApiCall(
  endpoint: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  if (!REVELOT_API_KEY) {
    throw new Error('REVELOT API Key nicht konfiguriert. Bitte VITE_REVELOT_API_KEY setzen.');
  }

  const url = `${REVELOT_API_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${REVELOT_API_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (response.ok) {
        return response;
      }

      // Bei 429 (Rate Limit) oder 5xx Fehlern retry
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Bei anderen Fehlern sofort werfen
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`REVELOT API Fehler: ${response.status} - ${errorData.message || response.statusText}`);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`REVELOT API Call fehlgeschlagen nach ${maxRetries} Versuchen: ${lastError?.message}`);
}

export interface RevelotSubscription {
  id: string;
  customer_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

export interface RevelotPlan {
  id: string;
  name: string;
  tier: 'free' | 'pro' | 'enterprise';
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
}

/**
 * Erstellt einen REVELOT Customer
 */
export async function createRevelotCustomer(
  email: string,
  name?: string
): Promise<string | null> {
  try {
    if (!REVELOT_API_KEY) {
      console.warn('REVELOT API Key nicht konfiguriert. Verwende Placeholder.');
      return `cust_${Date.now()}`;
    }

    const response = await revelotApiCall('/customers', {
      method: 'POST',
      body: JSON.stringify({ email, name: name || email })
    });

    const data = await response.json();
    
    if (!data.id) {
      throw new Error('REVELOT Customer ID nicht in Response gefunden');
    }

    return data.id;
  } catch (error) {
    console.error('Fehler beim Erstellen des REVELOT Customers:', error);
    // Fallback: Placeholder für Development
    if (error instanceof Error && error.message.includes('nicht konfiguriert')) {
      return `cust_${Date.now()}`;
    }
    return null;
  }
}

/**
 * Erstellt eine Subscription
 */
export async function createSubscription(
  customerId: string,
  planId: string
): Promise<RevelotSubscription | null> {
  try {
    if (!REVELOT_API_KEY) {
      console.warn('REVELOT API Key nicht konfiguriert. Verwende Placeholder.');
      return {
        id: `sub_${Date.now()}`,
        customer_id: customerId,
        plan_id: planId,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancel_at_period_end: false
      };
    }

    const response = await revelotApiCall('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        plan_id: planId
      })
    });

    const data = await response.json();
    
    return {
      id: data.id,
      customer_id: data.customer_id || customerId,
      plan_id: data.plan_id || planId,
      status: data.status || 'active',
      current_period_start: data.current_period_start || new Date().toISOString(),
      current_period_end: data.current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: data.cancel_at_period_end || false
    };
  } catch (error) {
    console.error('Fehler beim Erstellen der Subscription:', error);
    // Fallback für Development
    if (error instanceof Error && error.message.includes('nicht konfiguriert')) {
      return {
        id: `sub_${Date.now()}`,
        customer_id: customerId,
        plan_id: planId,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancel_at_period_end: false
      };
    }
    return null;
  }
}

/**
 * Aktualisiert Subscription in Supabase
 */
export async function syncSubscriptionToSupabase(
  userId: string,
  revelotSubscription: RevelotSubscription,
  tier: 'free' | 'pro' | 'enterprise'
): Promise<Subscription | null> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: userId,
        revelot_subscription_id: revelotSubscription.id,
        tier,
        status: revelotSubscription.status,
        current_period_start: revelotSubscription.current_period_start,
        current_period_end: revelotSubscription.current_period_end
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Fehler beim Sync der Subscription:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Sync der Subscription:', error);
    return null;
  }
}

/**
 * Lädt aktuelle Subscription eines Users
 */
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Keine Subscription gefunden - erstelle Free Tier
        return await createFreeSubscription(userId);
      }
      console.error('Fehler beim Laden der Subscription:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Laden der Subscription:', error);
    return null;
  }
}

/**
 * Erstellt eine Free Subscription
 */
async function createFreeSubscription(userId: string): Promise<Subscription | null> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        tier: 'free',
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.error('Fehler beim Erstellen der Free Subscription:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Fehler beim Erstellen der Free Subscription:', error);
    return null;
  }
}

/**
 * Kündigt eine Subscription
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<boolean> {
  try {
    if (REVELOT_API_KEY) {
      try {
        await revelotApiCall(`/subscriptions/${subscriptionId}/cancel`, {
          method: 'POST'
        });
      } catch (error) {
        console.warn('REVELOT API Cancel fehlgeschlagen, aktualisiere nur Supabase:', error);
      }
    }

    // Update in Supabase
    const { error } = await supabase
      .from('subscriptions')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('revelot_subscription_id', subscriptionId);

    if (error) {
      console.error('Fehler beim Kündigen der Subscription in Supabase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Fehler beim Kündigen der Subscription:', error);
    return false;
  }
}

/**
 * Verarbeitet REVELOT Webhook-Events
 */
export async function handleRevelotWebhook(
  event: string,
  data: any
): Promise<boolean> {
  try {
    switch (event) {
      case 'subscription.updated':
      case 'subscription.cancelled':
      case 'subscription.renewed':
        // Update Subscription in Supabase
        if (data.subscription?.id) {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              status: data.subscription.status,
              current_period_start: data.subscription.current_period_start,
              current_period_end: data.subscription.current_period_end,
              updated_at: new Date().toISOString()
            })
            .eq('revelot_subscription_id', data.subscription.id);

          if (error) {
            console.error('Fehler beim Webhook-Update:', error);
            return false;
          }
        }
        break;

      case 'payment.succeeded':
      case 'payment.failed':
        // Log Payment-Events
        console.log('REVELOT Payment Event:', event, data);
        break;

      default:
        console.log('Unbekanntes REVELOT Webhook Event:', event);
    }

    return true;
  } catch (error) {
    console.error('Fehler beim Verarbeiten des REVELOT Webhooks:', error);
    return false;
  }
}

/**
 * Verfügbare Pläne
 */
export const REVELOT_PLANS: RevelotPlan[] = [
  {
    id: 'free',
    name: 'Free',
    tier: 'free',
    price: 0,
    currency: 'EUR',
    interval: 'month',
    features: [
      '1 Projekt',
      'Basis AI-Agenten',
      'Community Support'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    tier: 'pro',
    price: 29,
    currency: 'EUR',
    interval: 'month',
    features: [
      'Unbegrenzte Projekte',
      'Alle AI-Agenten',
      'Priority Support',
      'Erweiterte Features'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    price: 99,
    currency: 'EUR',
    interval: 'month',
    features: [
      'Alles aus Pro',
      'Dedicated Support',
      'Custom Integrations',
      'SLA Garantie'
    ]
  }
];

