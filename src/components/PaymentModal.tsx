/**
 * NeXifyAI Builder - Payment Modal
 * REVELOT Business Subscription Management
 */

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, CreditCard, Zap, Crown, Sparkles } from 'lucide-react';
import { getUserSubscription, REVELOT_PLANS, type RevelotPlan, cancelSubscription, createSubscription, syncSubscriptionToSupabase, createRevelotCustomer } from '../lib/payments/revelot';
import { supabase } from '../lib/supabase/client';
import type { Subscription } from '../lib/supabase/schema';

interface PaymentModalProps {
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ onClose }) => {
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const sub = await getUserSubscription(user.id);
        setCurrentSubscription(sub);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (plan: RevelotPlan) => {
    if (processing) return;
    
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Bitte melde dich an, um ein Abo zu erstellen.');
        return;
      }

      // Erstelle REVELOT Customer falls nötig
      let customerId = currentSubscription?.revelot_subscription_id?.split('_')[0] || null;
      if (!customerId) {
        customerId = await createRevelotCustomer(user.email || '', user.user_metadata?.full_name);
      }

      if (!customerId) {
        alert('Fehler beim Erstellen des Customers. Bitte versuche es erneut.');
        return;
      }

      // Erstelle Subscription
      const revelotSub = await createSubscription(customerId, plan.id);
      if (!revelotSub) {
        alert('Fehler beim Erstellen der Subscription. Bitte versuche es erneut.');
        return;
      }

      // Sync zu Supabase
      const sub = await syncSubscriptionToSupabase(user.id, revelotSub, plan.tier);
      if (sub) {
        setCurrentSubscription(sub);
        alert(`Erfolgreich auf ${plan.name} upgradet!`);
      }
    } catch (error) {
      console.error('Fehler beim Upgrade:', error);
      alert('Fehler beim Upgrade. Bitte versuche es erneut.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!currentSubscription?.revelot_subscription_id) return;
    
    if (!confirm('Möchtest du dein Abo wirklich kündigen?')) return;

    setProcessing(true);
    try {
      const success = await cancelSubscription(currentSubscription.revelot_subscription_id);
      if (success) {
        await loadSubscription();
        alert('Abo erfolgreich gekündigt.');
      }
    } catch (error) {
      console.error('Fehler beim Kündigen:', error);
      alert('Fehler beim Kündigen. Bitte versuche es erneut.');
    } finally {
      setProcessing(false);
    }
  };

  const getPlanIcon = (tier: string) => {
    switch (tier) {
      case 'pro':
        return Zap;
      case 'enterprise':
        return Crown;
      default:
        return Sparkles;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-[#0B0F17] border border-slate-800 rounded-2xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#0B0F17] border-b border-slate-800 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <CreditCard className="text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Subscription Management</h2>
              <p className="text-sm text-slate-400">REVELOT Business</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Current Subscription */}
          {currentSubscription && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Aktuelles Abo</p>
                  <p className="text-lg font-semibold text-white capitalize">{currentSubscription.tier}</p>
                  {currentSubscription.current_period_end && (
                    <p className="text-xs text-slate-500 mt-1">
                      Läuft ab: {new Date(currentSubscription.current_period_end).toLocaleDateString('de-DE')}
                    </p>
                  )}
                </div>
                {currentSubscription.tier !== 'free' && (
                  <button
                    onClick={handleCancel}
                    disabled={processing}
                    className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                  >
                    Kündigen
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Available Plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {REVELOT_PLANS.map((plan) => {
              const Icon = getPlanIcon(plan.tier);
              const isCurrentPlan = currentSubscription?.tier === plan.tier;
              const isUpgrade = !currentSubscription || 
                (plan.tier === 'pro' && currentSubscription.tier === 'free') ||
                (plan.tier === 'enterprise' && currentSubscription.tier !== 'enterprise');

              return (
                <div
                  key={plan.id}
                  className={`p-6 rounded-lg border ${
                    isCurrentPlan
                      ? 'bg-blue-500/20 border-blue-500'
                      : 'bg-[#020408] border-slate-800 hover:border-slate-700'
                  } transition-all`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${
                      plan.tier === 'pro' ? 'bg-yellow-500/20' :
                      plan.tier === 'enterprise' ? 'bg-purple-500/20' :
                      'bg-slate-800'
                    }`}>
                      <Icon className={
                        plan.tier === 'pro' ? 'text-yellow-400' :
                        plan.tier === 'enterprise' ? 'text-purple-400' :
                        'text-slate-400'
                      } size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{plan.name}</h3>
                      <p className="text-2xl font-extrabold text-white mt-1">
                        {plan.price === 0 ? 'Kostenlos' : `€${plan.price}`}
                        {plan.price > 0 && <span className="text-sm text-slate-400">/{plan.interval}</span>}
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                        <CheckCircle2 size={16} className="text-blue-400 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrentPlan ? (
                    <button
                      disabled
                      className="w-full py-2 bg-slate-700 text-slate-400 rounded-lg cursor-not-allowed"
                    >
                      Aktueller Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan)}
                      disabled={processing || !isUpgrade}
                      className={`w-full py-2 rounded-lg font-medium transition-colors ${
                        isUpgrade
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {isUpgrade ? 'Upgraden' : 'Nicht verfügbar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

