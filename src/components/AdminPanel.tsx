import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Search,
  AlertTriangle,
  Activity,
  ShieldAlert,
  CheckCircle,
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  ArrowRight,
  PieChart,
  LogOut,
  Sun,
  Moon,
  FileText,
  Upload,
  Trash2,
  RefreshCw,
  Gauge,
  ThumbsDown,
  HelpCircle
} from 'lucide-react';
import { getAllMessages } from '../services/messagesService';
import { getAllUsers } from '../services/usersService';
import { createUsageAlerts, getRecentAlerts } from '../services/adminAlertsService';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { listDocuments, uploadDocument, deleteDocument, updateDocumentAccess } from '../services/documentsService';
import type { DocumentItem } from '../services/documentsService';
import { getPasteEvents } from '../services/extensionService';
import type { PasteEvent } from '../services/extensionService';
import { LogoMark } from './Logo';
import type { AdminAlert, Message, User } from '../types';

type ViewState = 'dashboard' | 'students' | 'analytics' | 'documents' | 'quality' | 'moderation';

interface MessageWithUser extends Message {
  user_id?: string | null;
}

interface UserWithStats extends User {
  promo?: number | null;
  usageScore: number;
  lastActive: string;
  messageCount: number;
  dailyMessageCount: number;
}

interface TrendData {
  topic: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
}

type UsageStatus = 'modere' | 'moyenne' | 'critique' | 'abusive';

const getUsageStatus = (score: number): { label: string; color: string; darkColor: string; icon: React.ReactNode; status: UsageStatus } => {
  const statuses = {
    modere: {
      label: 'Utilisation Modérée',
      color: 'bg-positive-soft text-positive border-positive/25',
      darkColor: '',
      icon: <CheckCircle size={16} />
    },
    moyenne: {
      label: 'Utilisation Moyenne',
      color: 'bg-accent-soft text-accent-ink border-accent/25',
      darkColor: '',
      icon: <Activity size={16} />
    },
    critique: {
      label: 'Utilisation Critique',
      color: 'bg-watch-soft text-watch border-watch/25',
      darkColor: '',
      icon: <AlertTriangle size={16} />
    },
    abusive: {
      label: 'Utilisation Abusive',
      color: 'bg-critical-soft text-critical border-critical/25',
      darkColor: '',
      icon: <ShieldAlert size={16} />
    }
  };

  if (score <= 35) return { ...statuses.modere, status: 'modere' };
  if (score <= 60) return { ...statuses.moyenne, status: 'moyenne' };
  if (score <= 80) return { ...statuses.critique, status: 'critique' };
  return { ...statuses.abusive, status: 'abusive' };
};

export function AdminPanel() {
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [promoFilter, setPromoFilter] = useState<string>("all");
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [messages, setMessages] = useState<MessageWithUser[]>([]);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [pasteEvents, setPasteEvents] = useState<PasteEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, messagesData] = await Promise.all([
        getAllUsers(),
        getAllMessages()
      ]);

      // Calculer les statistiques pour chaque utilisateur
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const usersWithStats: UserWithStats[] = usersData.map(user => {
        const userMessages = messagesData.filter(msg => msg.user_id === user.id);
        const messageCount = userMessages.length;
        const dailyMessages = userMessages.filter(msg => msg.created_at && new Date(msg.created_at) >= startOfDay);
        const dailyMessageCount = dailyMessages.length;
        
        const usageScore = Math.min(100, Math.round((dailyMessageCount / 50) * 100));

        // Dernière activité (basée sur le dernier message)
        const lastMessage = userMessages
          .filter(msg => msg.created_at)
          .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())[0];
        
        let lastActive = "Jamais";
        if (lastMessage?.created_at) {
          const lastDate = new Date(lastMessage.created_at);
          const now = new Date();
          const diffMinutes = Math.floor((now.getTime() - lastDate.getTime()) / 60000);
          
          if (diffMinutes < 60) {
            lastActive = `Il y a ${diffMinutes} min`;
          } else if (diffMinutes < 1440) {
            lastActive = `Il y a ${Math.floor(diffMinutes / 60)}h`;
          } else {
            lastActive = `Il y a ${Math.floor(diffMinutes / 1440)}j`;
          }
        }

        return {
          ...user,
          usageScore,
          lastActive,
          messageCount,
          dailyMessageCount
        };
      });

      setUsers(usersWithStats);
      setMessages(messagesData as MessageWithUser[]);

      try {
        await createUsageAlerts(usersWithStats, 25);
        const recentAlerts = await getRecentAlerts(5);
        setAlerts(recentAlerts);
      } catch (alertError) {
        console.error('Erreur lors des alertes admin:', alertError);
      }

      try {
        setPasteEvents(await getPasteEvents(50));
      } catch (pasteError) {
        console.error('Erreur lors du chargement des collages:', pasteError);
      }
      
      if (usersWithStats.length > 0 && !selectedUserId) {
        setSelectedUserId(usersWithStats[0].id || null);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    } finally {
      setLoading(false);
    }
  };

  // Documents les plus consultés : sources RAG réellement utilisées dans les réponses
  const calculateTrends = (): TrendData[] => {
    const docCounts: { [key: string]: number } = {};

    messages.forEach(msg => {
      if (!msg.user_id && Array.isArray(msg.rag_sources)) {
        msg.rag_sources.forEach(titre => {
          docCounts[titre] = (docCounts[titre] || 0) + 1;
        });
      }
    });

    return Object.entries(docCounts)
      .map(([topic, count]) => ({
        topic,
        count,
        trend: 'stable' as const
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  };

  const DashboardHome = () => {
    const totalMessages = messages.length;
    const criticalUsers = users.filter(u => u.usageScore > 60).length;
    const botMessages = messages.filter(m => !m.user_id).length;
    const botResponseRate = totalMessages > 0 ? ((botMessages / totalMessages) * 100).toFixed(1) : '0';

    // Satisfaction (réutilise la logique de la vue Qualité)
    const rated = messages.filter(m => !m.user_id && (m.feedback === 'up' || m.feedback === 'down'));
    const up = rated.filter(m => m.feedback === 'up').length;
    const satisfaction = rated.length ? Math.round((up / rated.length) * 100) : null;

    // Messages signalés (modération) et trous de connaissance
    const flagged = messages.filter(m => m.user_id && m.flagged);
    const gaps = messages
      .filter(m => !m.user_id && m.rag_context_found === false && typeof m.rag_similarity === 'number')
      .sort((a, b) => (b.rag_similarity as number) - (a.rag_similarity as number))
      .slice(0, 4);

    const watchlist = users.filter(u => u.usageScore > 60).sort((a, b) => b.usageScore - a.usageScore).slice(0, 3);

    // Petite sparkline décorative (répartition d'activité) — barres pseudo-stables par index
    const spark = (seed: number) => Array.from({ length: 7 }, (_, i) => 30 + ((seed * 13 + i * 29) % 60));

    const Kpi = ({ label, value, unit, delta, deltaUp, seed, accent }:
      { label: string; value: string; unit?: string; delta?: string; deltaUp?: boolean; seed: number; accent?: 'accent' | 'critical' | 'positive' }) => {
      const barColor = accent === 'critical' ? 'bg-critical' : accent === 'positive' ? 'bg-positive' : 'bg-accent';
      return (
        <div className="border border-hairline rounded-none bg-surface px-3.5 py-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
          <div className="font-num text-[26px] leading-none mt-1.5 text-ink">{value}<span className="text-[15px]">{unit}</span></div>
          {delta && (
            <div className={`font-mono text-[10px] uppercase tracking-wide mt-1.5 ${deltaUp ? 'text-positive' : 'text-critical'}`}>
              {deltaUp ? '▲' : '▲'} {delta}
            </div>
          )}
          <div className="flex items-end gap-[2px] h-[22px] mt-2">
            {spark(seed).map((h, i) => (
              <span key={i} className={`flex-1 rounded-none ${i === 6 ? barColor : 'bg-accent/35'}`} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      );
    };

    return (
      <div className="p-5 max-w-[1180px] mx-auto animate-in fade-in duration-300">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-base text-ink">Vue d'ensemble</h1>
          <span className="font-num text-[11.5px] text-ink-3">admin / dashboard · 7 derniers jours</span>
        </div>
        <p className="text-[12.5px] text-ink-2 mt-1 mb-4">Pilotage de l'activité, de la qualité des réponses et de la modération.</p>

        {alerts.length > 0 && (
          <div className="mb-3 rounded-none border-l-2 border border-watch/40 border-l-watch bg-watch-soft px-3.5 py-2.5 text-[12.5px] text-watch">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider mb-1.5">
              <AlertTriangle size={15} /> Alertes usage (aujourd'hui)
            </div>
            <div className="space-y-0.5">
              {alerts.map((alert) => (<div key={alert.id}>{alert.message}</div>))}
            </div>
          </div>
        )}

        {/* KPI compacts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
          <Kpi label="Messages totaux" value={totalMessages.toLocaleString('fr-FR')} delta="cette semaine" deltaUp seed={2} />
          <Kpi label="Utilisations critiques" value={String(criticalUsers)} delta={`${watchlist.length} à surveiller`} accent="critical" seed={5} />
          <Kpi label="Taux de réponse bot" value={botResponseRate} unit="%" seed={3} />
          <Kpi label="Satisfaction" value={satisfaction === null ? '—' : String(satisfaction)} unit={satisfaction === null ? '' : '%'} delta="réponses notées" deltaUp accent="positive" seed={7} />
        </div>

        {/* Deux panneaux : modération + trous */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3">
          <div className="border border-hairline rounded-none bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Modération — à confirmer</span>
              <span className="font-num text-[10.5px] font-semibold px-1.5 py-0.5 rounded-none bg-critical-soft text-critical">{flagged.length} signalés</span>
            </div>
            {flagged.slice(0, 3).map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-hairline last:border-b-0 text-[12.5px]">
                <span className="w-[3px] self-stretch rounded-none bg-critical" />
                <span className="font-num text-[10.5px] font-semibold px-1.5 py-0.5 rounded-none bg-critical-soft text-critical">CODE</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-ink">« {m.content} »</div>
                </div>
              </div>
            ))}
            {watchlist.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-hairline last:border-b-0 text-[12.5px]">
                <span className="w-[3px] self-stretch rounded-none bg-watch" />
                <span className="font-num text-[10.5px] font-semibold px-1.5 py-0.5 rounded-none bg-watch-soft text-watch">USAGE</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-ink">{u.dailyMessageCount} messages aujourd'hui — surveiller</div>
                  <div className="font-num text-[11px] text-ink-3">{u.email} · promo {u.promo ?? '—'}</div>
                </div>
                <div className="w-[70px] h-1.5 rounded-none bg-surface-2 overflow-hidden">
                  <span className="block h-full bg-watch" style={{ width: `${u.usageScore}%` }} />
                </div>
              </div>
            ))}
            {flagged.length === 0 && watchlist.length === 0 && (
              <div className="px-3.5 py-6 text-center text-[12px] text-ink-3">Aucun signalement · tout est sain ✓</div>
            )}
          </div>

          <div className="border border-hairline rounded-none bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Trous de connaissance</span>
              <span className="font-num text-[10.5px] font-semibold px-1.5 py-0.5 rounded-none bg-watch-soft text-watch">sous 0.65</span>
            </div>
            {gaps.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-hairline last:border-b-0 text-[12.5px]">
                <div className="flex-1 min-w-0 truncate text-ink">« {m.content} »</div>
                <span className="font-num text-watch">{(m.rag_similarity as number).toFixed(2)}</span>
              </div>
            ))}
            {gaps.length === 0 && (
              <div className="px-3.5 py-6 text-center text-[12px] text-ink-3">Aucun trou détecté récemment</div>
            )}
          </div>
        </div>

        {/* Accès rapides discrets */}
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <button onClick={() => setCurrentView('students')} className="group flex items-center justify-between border border-hairline rounded-none bg-surface px-3.5 py-3 hover:border-accent transition-colors text-left">
            <div>
              <div className="text-[13px] font-semibold text-ink">Vue Étudiants</div>
              <div className="text-[11.5px] text-ink-3">Scores d'usage · historique · modération</div>
            </div>
            <ArrowRight size={16} className="text-accent group-hover:translate-x-1 transition-transform" />
          </button>
          <button onClick={() => setCurrentView('analytics')} className="group flex items-center justify-between border border-hairline rounded-none bg-surface px-3.5 py-3 hover:border-accent transition-colors text-left">
            <div>
              <div className="text-[13px] font-semibold text-ink">Vue Analytique</div>
              <div className="text-[11.5px] text-ink-3">Tendances · documents · pics d'activité</div>
            </div>
            <ArrowRight size={16} className="text-accent group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    );
  };

  const AnalyticsView = () => {
    const trends = calculateTrends();

    // Activité : questions (messages utilisateur) par jour sur les 7 derniers jours
    const dayMs = 24 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startWindow = startOfToday.getTime() - 6 * dayMs;
    const perDay = [0, 0, 0, 0, 0, 0, 0];
    messages.forEach(m => {
      if (!m.user_id || !m.created_at) return;
      const idx = Math.floor((new Date(m.created_at).getTime() - startWindow) / dayMs);
      if (idx >= 0 && idx < 7) perDay[idx]++;
    });
    const activity = perDay.map((count, i) => ({
      count,
      label: new Date(startWindow + i * dayMs).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
    }));
    const maxActivity = Math.max(1, ...perDay);

    const promoStats = users.reduce((acc, user) => {
      const label = user.promo ? `Promo ${user.promo}` : 'Autre';
      acc[label] = (acc[label] || 0) + user.messageCount;
      return acc;
    }, {} as { [key: string]: number });

    const totalInteractions = Object.values(promoStats).reduce((sum, count) => sum + count, 0);
    const promoEntries = Object.entries(promoStats).sort((a, b) => b[1] - a[1]);

    // Palette catégorielle (séries distinctes, PAS des états) — nuances
    // monochrome + sémantique cohérentes avec le design system station.
    const colors = ['bg-accent', 'bg-ink-3', 'bg-positive', 'bg-watch', 'bg-critical'];

    return (
      <div className="flex-1 overflow-y-auto p-5 max-w-[1180px] mx-auto animate-in fade-in duration-300">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-base text-ink">Tendances & Statistiques</h1>
            <span className="font-num text-[11.5px] text-ink-3">admin / analytics · interactions étudiants</span>
          </div>
          <button onClick={() => setCurrentView('dashboard')} className="font-mono text-[10px] uppercase tracking-wider text-ink-3 hover:text-accent transition-colors">
            Retour Dashboard
          </button>
        </div>
        <p className="text-[12.5px] text-ink-2 mt-1 mb-4">Analyse globale des interactions etudiants.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="border border-hairline rounded-none bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
                <TrendingUp size={15} className="text-positive" />
                Documents les plus consultés
              </span>
            </div>
            <div className="px-3.5 py-3 space-y-2.5">
              {trends.length > 0 ? trends.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5 group text-[12.5px]">
                  <span className="w-6 text-center font-num text-[11px] text-ink-3">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-ink truncate">{item.topic}</span>
                      <span className="font-num text-[11px] font-semibold text-ink-3 shrink-0">{item.count}×</span>
                    </div>
                    <div className="w-full bg-surface-2 rounded-none h-1.5 overflow-hidden">
                      <div
                        className="bg-accent h-1.5 rounded-none"
                        style={{ width: `${Math.min(100, (item.count / (trends[0]?.count || 1)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-[12px] text-ink-3 text-center py-6">Aucune donnee disponible</p>
              )}
            </div>
          </div>

          <div className="border border-hairline rounded-none bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
                <PieChart size={15} className="text-accent" />
                Repartition par Promo
              </span>
            </div>
            <div className="px-3.5 py-3 space-y-3">
              {promoEntries.map(([promo, count], idx) => (
                <div key={promo}>
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-[12.5px] font-semibold text-ink">{promo}</span>
                    <span className="font-num text-[11px] text-ink-3">{count} interactions</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 bg-surface-2 rounded-none h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-none ${colors[idx % colors.length]}`}
                        style={{ width: `${totalInteractions > 0 ? (count / totalInteractions) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <span className="font-num text-[11px] font-semibold text-ink-3 w-8 text-right">
                      {totalInteractions > 0 ? Math.round((count / totalInteractions) * 100) : 0}%
                    </span>
                  </div>
                </div>
              ))}

              {promoEntries.length > 0 && (
                <div className="mt-1 rounded-none border border-hairline bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                  <strong className="text-ink">Analyse :</strong> La <strong>{promoEntries[0][0]}</strong> genere {Math.round((promoEntries[0][1] / totalInteractions) * 100)}% du trafic total.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Activité des 7 derniers jours */}
        <div className="border border-hairline rounded-none bg-surface overflow-hidden mt-3">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              <Activity size={15} className="text-accent" />
              Activité (7 derniers jours)
            </span>
          </div>
          <div className="px-3.5 py-3 flex items-end justify-between gap-2">
            {activity.map((day, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <span className="font-num text-[11px] font-semibold text-ink">{day.count}</span>
                <div className="w-full flex items-end justify-center" style={{ height: '110px' }}>
                  <div
                    className="w-full max-w-[36px] bg-accent rounded-none"
                    style={{ height: `${Math.max(2, (day.count / maxActivity) * 100)}%` }}
                  ></div>
                </div>
                <span className="font-mono text-[10px] text-ink-3">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const QualityView = () => {
    // Rattacher chaque réponse du bot à la question qui la précède (dans la conversation)
    const sorted = [...messages].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
    const lastUserByConv: Record<string, string> = {};
    const bots: { msg: MessageWithUser; question: string }[] = [];
    sorted.forEach((m) => {
      const conv = m.conversation_id || '';
      if (m.user_id) {
        lastUserByConv[conv] = m.content;
      } else {
        bots.push({ msg: m, question: lastUserByConv[conv] || '—' });
      }
    });

    const rated = bots.filter((b) => b.msg.feedback === 'up' || b.msg.feedback === 'down');
    const up = bots.filter((b) => b.msg.feedback === 'up').length;
    const satisfaction = rated.length ? Math.round((up / rated.length) * 100) : null;
    const negatives = bots.filter((b) => b.msg.feedback === 'down');
    const noContext = bots
      .filter((b) => b.msg.rag_context_found === false)
      .sort((a, b) => (b.msg.rag_similarity || 0) - (a.msg.rag_similarity || 0));

    const Tile = ({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: 'positive' | 'critical' | 'watch' }) => (
      <div className="border border-hairline rounded-none bg-surface px-3.5 py-3">
        <div className={`font-mono text-[10px] uppercase tracking-wider text-${accent}`}>{label}</div>
        <div className="font-num text-[26px] leading-none mt-1.5 text-ink">{value}</div>
        <div className="text-[11px] text-ink-3 mt-1.5">{hint}</div>
      </div>
    );

    return (
      <div className="flex-1 overflow-y-auto p-5 max-w-[1180px] mx-auto animate-in fade-in duration-300">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-base text-ink">Qualité & feedback</h1>
          <span className="font-num text-[11.5px] text-ink-3">admin / quality · feedback des réponses</span>
        </div>
        <p className="text-[12.5px] text-ink-2 mt-1 mb-4">Ce que le chatbot réussit, et ce qu'il faut améliorer.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
          <Tile
            accent="positive"
            label="Satisfaction"
            value={satisfaction === null ? '—' : `${satisfaction}%`}
            hint={`${rated.length} réponse(s) notée(s)`}
          />
          <Tile
            accent="critical"
            label="Réponses 👎"
            value={`${negatives.length}`}
            hint="à relire"
          />
          <Tile
            accent="watch"
            label="Sans contexte"
            value={`${noContext.length}`}
            hint="trous de connaissance"
          />
        </div>

        <div className="border border-hairline rounded-none bg-surface overflow-hidden mb-3">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              <ThumbsDown size={15} className="text-critical" /> Réponses mal notées
            </span>
          </div>
          <div className="px-3.5 py-3 space-y-2">
            {negatives.length === 0 ? (
              <p className="text-[12px] text-center py-4 text-ink-3">Aucune réponse notée 👎 pour l'instant.</p>
            ) : negatives.map((b) => (
              <div key={b.msg.id} className="rounded-none border-l-2 border-l-critical border border-hairline bg-surface-2 px-3 py-2 text-[12.5px]">
                <p className="text-ink">❓ {b.question}</p>
                <p className="mt-1 text-ink-3">💬 {b.msg.content.slice(0, 160)}{b.msg.content.length > 160 ? '…' : ''}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-hairline rounded-none bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              <HelpCircle size={15} className="text-watch" /> Questions sans contexte — docs à ajouter ?
            </span>
          </div>
          <div className="px-3.5 py-3 space-y-2">
            {noContext.length === 0 ? (
              <p className="text-[12px] text-center py-4 text-ink-3">Aucune question restée sans contexte. 🎉</p>
            ) : noContext.map((b) => (
              <div key={b.msg.id} className="flex items-center justify-between gap-3 rounded-none border border-hairline bg-surface-2 px-3 py-2 text-[12.5px]">
                <span className="text-ink truncate">❓ {b.question}</span>
                <span className="font-num text-[10.5px] font-semibold px-1.5 py-0.5 rounded-none bg-watch-soft text-watch shrink-0">
                  max {b.msg.rag_similarity != null ? b.msg.rag_similarity.toFixed(2) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const ModerationView = () => {
    const userById: Record<string, UserWithStats> = {};
    users.forEach((u) => { if (u.id) userById[u.id] = u; });

    const attempts = messages
      .filter((m) => !!m.user_id && m.flagged === true)
      .map((m) => ({ msg: m, user: m.user_id ? userById[m.user_id] : undefined }))
      .sort((a, b) => {
        const ta = a.msg.created_at ? new Date(a.msg.created_at).getTime() : 0;
        const tb = b.msg.created_at ? new Date(b.msg.created_at).getTime() : 0;
        return tb - ta;
      });

    const watchlist = users
      .filter((u) => u.usageScore > 60)
      .sort((a, b) => b.usageScore - a.usageScore);

    return (
      <div className="flex-1 overflow-y-auto p-5 max-w-[1180px] mx-auto animate-in fade-in duration-300">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-base text-ink">Modération</h1>
          <span className="font-num text-[11.5px] text-ink-3">admin / moderation · garde-fou pédagogique</span>
        </div>
        <p className="text-[12.5px] text-ink-2 mt-1 mb-4">Contournements du garde-fou pédagogique et surveillance de l'usage.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
          <div className="border border-hairline rounded-none bg-surface px-3.5 py-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-critical">Tentatives de contournement</div>
            <div className="font-num text-[26px] leading-none mt-1.5 text-ink">{attempts.length}</div>
          </div>
          <div className="border border-hairline rounded-none bg-surface px-3.5 py-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-critical">Collages de code (VS Code)</div>
            <div className="font-num text-[26px] leading-none mt-1.5 text-ink">{pasteEvents.length}</div>
          </div>
          <div className="border border-hairline rounded-none bg-surface px-3.5 py-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-watch">Utilisateurs à surveiller</div>
            <div className="font-num text-[26px] leading-none mt-1.5 text-ink">{watchlist.length}</div>
          </div>
        </div>

        <div className="border border-hairline rounded-none bg-surface overflow-hidden mb-3">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              <ShieldAlert size={15} className="text-critical" /> Demandes suspectes (code / solution direct)
            </span>
          </div>
          <div className="px-3.5 py-3 space-y-2">
            {attempts.length === 0 ? (
              <p className="text-[12px] text-center py-4 text-ink-3">Aucune tentative détectée. 👍</p>
            ) : attempts.map((a) => (
              <div key={a.msg.id} className="flex gap-2.5 rounded-none border border-hairline bg-surface-2 px-3 py-2 text-[12.5px]">
                <span className="w-[3px] self-stretch rounded-none bg-critical" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink truncate">{a.user?.name || a.user?.email || 'Utilisateur inconnu'}</span>
                    <span className="font-num text-[10px] text-ink-3 shrink-0">{a.msg.created_at ? new Date(a.msg.created_at).toLocaleString('fr-FR') : ''}</span>
                  </div>
                  <p className="mt-1 text-ink-3">« {a.msg.content} »</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Collages massifs détectés par l'extension VS Code */}
        <div className="border border-hairline rounded-none bg-surface overflow-hidden mb-3">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              <FileText size={15} className="text-critical" /> Collages de code suspects (VS Code)
            </span>
            <span className="font-num text-[10.5px] font-semibold px-1.5 py-0.5 rounded-none bg-critical-soft text-critical">
              {pasteEvents.length}
            </span>
          </div>
          <div className="px-3.5 py-3 space-y-2">
            {pasteEvents.length === 0 ? (
              <p className="text-[12px] text-center py-4 text-ink-3">Aucun collage massif détecté. 👍</p>
            ) : pasteEvents.map((p) => (
              <div key={p.id} className="flex gap-2.5 rounded-none border border-hairline bg-surface-2 px-3 py-2 text-[12.5px]">
                <span className="w-[3px] self-stretch rounded-none bg-critical" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink truncate">
                      {p.user?.name || p.user?.email || 'Utilisateur inconnu'}
                    </span>
                    <span className="font-num text-[10px] text-ink-3 shrink-0">
                      {new Date(p.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 font-num text-[11px] text-ink-3">
                    <span className="px-1.5 py-0.5 rounded-none bg-critical-soft text-critical font-semibold">
                      {p.line_count} lignes
                    </span>
                    {p.language && (
                      <span className="px-1.5 py-0.5 rounded-none bg-accent-soft text-accent-ink font-semibold uppercase">
                        {p.language}
                      </span>
                    )}
                    {p.file_name && <span className="truncate">{p.file_name}</span>}
                  </div>
                  {p.excerpt && (
                    <pre className="mt-1.5 text-[11px] text-ink-3 bg-ground border border-hairline rounded-none px-2 py-1.5 overflow-x-auto whitespace-pre-wrap max-h-24">
                      {p.excerpt}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-hairline rounded-none bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              <AlertTriangle size={15} className="text-watch" /> Usage élevé à surveiller
            </span>
          </div>
          <div className="px-3.5 py-3 space-y-2">
            {watchlist.length === 0 ? (
              <p className="text-[12px] text-center py-4 text-ink-3">Aucun usage anormal. 👍</p>
            ) : watchlist.map((u) => {
              const status = getUsageStatus(u.usageScore);
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-none border border-hairline bg-surface-2 px-3 py-2 text-[12.5px]">
                  <div className="min-w-0">
                    <p className="font-medium truncate text-ink">{u.name || u.email}</p>
                    <p className="font-num text-[11px] text-ink-3">{u.promo ? `Promo ${u.promo}` : 'Promo inconnue'} · {u.dailyMessageCount} msg aujourd'hui</p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-none border text-[11px] font-bold ${status.color} ${status.darkColor} shrink-0`}>
                    {status.icon}
                    {status.label} ({u.usageScore}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const StudentsView = () => {
    const selectedUser = users.find(u => u.id === selectedUserId) || users[0];

    // Promos réellement présentes (triées décroissant : la plus récente d'abord)
    const availablePromos = Array.from(
      new Set(users.map(u => u.promo).filter((p): p is number => typeof p === 'number'))
    ).sort((a, b) => b - a);

    const filteredUsers = users
      .filter(user => {
        const matchesSearch =
          (user.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
          (user.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
        const matchesPromo =
          promoFilter === 'all' ? true :
          promoFilter === 'none' ? (user.promo == null) :
          String(user.promo) === promoFilter;
        return matchesSearch && matchesPromo;
      })
      // Tri : par promo décroissante, puis par nom
      .sort((a, b) => {
        const pa = a.promo ?? -1, pb = b.promo ?? -1;
        if (pa !== pb) return pb - pa;
        return (a.name || a.email || '').localeCompare(b.name || b.email || '');
      });

    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[12.5px] text-ink-3">Chargement...</p>
        </div>
      );
    }

    if (!selectedUser) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[12.5px] text-ink-3">Aucun utilisateur selectionne</p>
        </div>
      );
    }

    const userStatus = getUsageStatus(selectedUser.usageScore);
    // Rattacher les réponses du bot (user_id null) au bon étudiant en
    // reconstituant conversation -> utilisateur depuis les messages utilisateur.
    const convToUser = new Map<string, string>();
    messages.forEach(m => {
      if (m.user_id && m.conversation_id) convToUser.set(m.conversation_id, m.user_id);
    });

    const userMessages = messages
      .filter(msg =>
        msg.user_id === selectedUser.id ||
        (!msg.user_id && !!msg.conversation_id && convToUser.get(msg.conversation_id) === selectedUser.id)
      )
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      });

    const getAvatarUrl = (user: User) => {
      if (user.avatar_url) return user.avatar_url;
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email || user.id}`;
    };

    return (
      <div className="flex flex-1 h-full overflow-hidden animate-in fade-in duration-300">
        <aside className="w-72 bg-surface border-r border-hairline flex flex-col z-10">
          <div className="p-3 border-b border-hairline space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" size={15} />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface-2 border border-hairline rounded-none pl-9 pr-3 py-2 text-[13px] text-ink placeholder:text-ink-3 outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 shrink-0">Promo</span>
              <select
                value={promoFilter}
                onChange={(e) => setPromoFilter(e.target.value)}
                className="flex-1 bg-surface-2 border border-hairline rounded-none px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent transition-colors font-num"
              >
                <option value="all">Toutes ({users.length})</option>
                {availablePromos.map(p => (
                  <option key={p} value={String(p)}>
                    {p} ({users.filter(u => u.promo === p).length})
                  </option>
                ))}
                {users.some(u => u.promo == null) && (
                  <option value="none">Sans promo ({users.filter(u => u.promo == null).length})</option>
                )}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {filteredUsers.map(user => {
              const status = getUsageStatus(user.usageScore);
              return (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id || null)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-none transition-colors text-left group border-l-2 ${
                    selectedUserId === user.id
                      ? 'bg-accent-soft border border-hairline border-l-accent'
                      : 'hover:bg-surface-2 border border-transparent border-l-transparent'
                  }`}
                >
                  <div className="relative">
                    <img src={getAvatarUrl(user)} alt={user.name || ''} className="w-8 h-8 rounded-full bg-surface-2" />
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface ${
                      status.status === 'modere' ? 'bg-positive' :
                      status.status === 'moyenne' ? 'bg-accent' :
                      status.status === 'critique' ? 'bg-watch' : 'bg-critical'
                    }`}></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-[12.5px] font-semibold truncate ${
                      selectedUserId === user.id ? 'text-accent-ink' : 'text-ink'
                    }`}>
                      {user.name || user.email}
                    </h3>
                    <p className="text-[11px] truncate text-ink-3">
                      {user.promo ? `Promo ${user.promo}` : 'Promo inconnue'}
                    </p>
                  </div>
                  <div className={`font-num text-[10.5px] font-semibold px-1.5 py-0.5 rounded-none ${
                    selectedUserId === user.id
                      ? 'bg-surface text-accent-ink'
                      : 'bg-surface-2 text-ink-3'
                  }`}>
                    {user.usageScore}%
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-ground">
          <header className="bg-surface border-b border-hairline px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={getAvatarUrl(selectedUser)} alt={selectedUser.name || ''} className="w-11 h-11 rounded-full border border-hairline" />
              <div>
                <h2 className="font-display text-base text-ink">{selectedUser.name || selectedUser.email}</h2>
                <div className="flex items-center gap-2 font-num text-[11.5px] text-ink-3">
                  <span>{selectedUser.promo ? `Promo ${selectedUser.promo}` : 'Promo inconnue'}</span> · <span>{selectedUser.email}</span>
                </div>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-none border text-[11px] font-bold ${userStatus.color} ${userStatus.darkColor}`}>
              {userStatus.icon}
              <span>{userStatus.label}</span>
              <span className="ml-1 opacity-75">({selectedUser.usageScore}%)</span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="border border-hairline rounded-none bg-surface overflow-hidden flex flex-col h-full">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline bg-surface-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Historique des messages</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {userMessages.length > 0 ? userMessages.map((msg, idx) => {
                  const isUser = !!msg.user_id;
                  const timestamp = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

                  return (
                    <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-none border text-[12.5px] ${
                        isUser
                          ? 'bg-accent on-accent border-accent'
                          : 'bg-surface-2 text-ink border-hairline'
                      }`}>
                        <div className="mb-1 font-mono text-[10px] opacity-70 uppercase tracking-wider">
                          {isUser ? (selectedUser.name || selectedUser.email) : 'Epibot'}
                        </div>
                        {msg.content}
                        {timestamp && (
                          <div className="mt-1 font-num text-[10px] opacity-60 text-right">{timestamp}</div>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-[12px] text-ink-3 text-center py-8">Aucun message dans l'historique</p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  };

  return (
    <div className={`admin-console ${theme === 'light' ? 'console-light' : ''} flex h-screen font-sans bg-ground text-ink transition-colors`}>
      <nav className="w-[62px] bg-rail border-r border-hairline flex flex-col items-center py-3 z-50 justify-between">
        <div className="flex flex-col items-center gap-1 w-full">
          <div className="w-9 h-9 rounded-[2px] bg-white/15 flex items-center justify-center mb-3 border border-white/20">
            <LogoMark size={16} tone="light" />
          </div>

          <div className="flex flex-col gap-1 w-full px-2.5">
            <NavButton
              active={currentView === 'dashboard'}
              onClick={() => setCurrentView('dashboard')}
              icon={<LayoutDashboard size={20} />}
              label="Accueil"
            />
            <NavButton
              active={currentView === 'students'}
              onClick={() => setCurrentView('students')}
              icon={<Users size={20} />}
              label="Etudiants"
            />
            <NavButton
              active={currentView === 'analytics'}
              onClick={() => setCurrentView('analytics')}
              icon={<BarChart3 size={20} />}
              label="Stats"
            />
            <NavButton
              active={currentView === 'quality'}
              onClick={() => setCurrentView('quality')}
              icon={<Gauge size={20} />}
              label="Qualité"
            />
            <NavButton
              active={currentView === 'documents'}
              onClick={() => setCurrentView('documents')}
              icon={<FileText size={20} />}
              label="Docs"
            />
            <NavButton
              active={currentView === 'moderation'}
              onClick={() => setCurrentView('moderation')}
              icon={<ShieldAlert size={20} />}
              label="Modér."
            />
          </div>
        </div>
        
        <div className="flex flex-col gap-1 w-full px-2.5 pb-1">
          <button
            onClick={toggleTheme}
            className="w-full h-10 rounded-[2px] flex items-center justify-center transition-colors text-white/55 hover:bg-white/10 hover:text-white"
            title={theme === 'light' ? 'Mode sombre' : 'Mode clair'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            onClick={signOut}
            className="w-full h-10 rounded-[2px] flex items-center justify-center transition-colors text-white/55 hover:bg-white/15 hover:text-white"
            title="Se deconnecter"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col overflow-hidden relative bg-ground">
        {currentView === 'dashboard' && <DashboardHome />}
        {currentView === 'students' && <StudentsView />}
        {currentView === 'analytics' && <AnalyticsView />}
        {currentView === 'quality' && <QualityView />}
        {currentView === 'documents' && <DocumentsView />}
        {currentView === 'moderation' && <ModerationView />}
      </div>
    </div>
  );
}

const DocumentsView = () => {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await listDocuments());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: number, titre: string) => {
    if (!window.confirm(`Supprimer "${titre}" et tous ses passages ?`)) return;
    setError(null);
    try {
      await deleteDocument(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la suppression');
    }
  };

  // Met à jour promo/date d'un document et rafraîchit sa ligne localement.
  const handleAccessChange = async (
    doc: DocumentItem,
    patch: Partial<Pick<DocumentItem, 'study_year' | 'start_date'>>
  ) => {
    const next = {
      study_year: patch.study_year !== undefined ? patch.study_year : (doc.study_year ?? null),
      start_date: patch.start_date !== undefined ? patch.start_date : (doc.start_date ?? null),
    };
    // Optimiste : maj immédiate de l'affichage
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, ...next } : d)));
    try {
      await updateDocumentAccess(doc.id, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la mise à jour');
      await load(); // resynchronise en cas d'échec
    }
  };

  const totalChunks = docs.reduce((sum, d) => sum + d.chunks, 0);

  return (
    <div className="flex-1 overflow-y-auto p-5 max-w-[1180px] mx-auto animate-in fade-in duration-300">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-base text-ink">Base de connaissances</h1>
          <span className="font-num text-[11.5px] text-ink-3">admin / documents · {docs.length} doc · {totalChunks} passages</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-none bg-surface-2 border border-hairline text-ink-2 hover:opacity-80 transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw size={16} />
          </button>
          <label
            className={`flex items-center gap-2 px-3 py-2 rounded-none border border-accent bg-accent on-accent hover:bg-accent-ink text-[13px] font-semibold cursor-pointer transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <Upload size={15} />
            {uploading ? 'Ingestion…' : 'Ajouter un document'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        </div>
      </div>
      <p className="text-[12.5px] text-ink-2 mt-1 mb-4">{docs.length} document(s) · {totalChunks} passage(s) indexé(s)</p>

      {error && (
        <div className="mb-3 rounded-none border-l-2 border border-critical border-l-critical bg-critical-soft px-3.5 py-2.5 text-[12.5px] text-critical">
          {error}
        </div>
      )}

      <div className="border border-hairline rounded-none bg-surface overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3.5 py-2.5 border-b border-hairline bg-surface-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
          <div className="col-span-4">Document</div>
          <div className="col-span-1 text-center">Passages</div>
          <div className="col-span-3">Promo (accès)</div>
          <div className="col-span-3">Démarrage</div>
          <div className="col-span-1"></div>
        </div>

        {loading ? (
          <div className="px-3.5 py-8 text-center text-[12px] text-ink-3">Chargement…</div>
        ) : docs.length === 0 ? (
          <div className="px-3.5 py-8 text-center text-[12px] text-ink-3">
            Aucun document. Clique sur « Ajouter un document » pour enrichir le chatbot.
          </div>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.id}
              className="grid grid-cols-12 gap-2 items-center px-3.5 py-2.5 border-b border-hairline last:border-b-0 hover:bg-surface-2 transition-colors text-[12.5px]"
            >
              <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-none border border-hairline bg-accent-soft text-accent shrink-0">
                  <FileText size={15} />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate text-ink">{doc.titre}</div>
                  <div className="font-num text-[11px] truncate text-ink-3">
                    {doc.created_at ? new Date(doc.created_at).toLocaleDateString('fr-FR') : '—'}
                  </div>
                </div>
              </div>
              <div className="col-span-1 text-center font-num font-semibold text-ink-2">{doc.chunks}</div>
              <div className="col-span-3">
                <select
                  value={doc.study_year ?? ''}
                  onChange={(e) =>
                    handleAccessChange(doc, { study_year: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full bg-surface-2 border border-hairline rounded-none px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent font-num transition-colors"
                >
                  <option value="">Toutes les promos</option>
                  {[1, 2, 3, 4, 5].map((y) => (
                    <option key={y} value={y}>tek{y}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <input
                  type="date"
                  value={doc.start_date ?? ''}
                  onChange={(e) =>
                    handleAccessChange(doc, { start_date: e.target.value || null })
                  }
                  className="w-full bg-surface-2 border border-hairline rounded-none px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent font-num transition-colors"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => handleDelete(doc.id, doc.titre)}
                  className="p-1.5 rounded-none text-ink-3 hover:text-critical hover:bg-critical-soft transition-colors"
                  title="Supprimer"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-[11px] text-ink-3">
        Formats acceptés : PDF, .txt, .md. Un fichier de même nom remplace l'ancien.<br />
        <span className="text-ink-2">Promo</span> : le document n'est visible que par les étudiants de cette année (tek1..tek5) ; « Toutes » = accessible à tous.
        <span className="text-ink-2"> Démarrage</span> : avant cette date, l'IA ne répond pas sur ce sujet.
      </p>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button
    onClick={onClick}
    className={`
      relative w-full h-10 rounded-[2px] flex items-center justify-center transition-colors
      ${active
        ? 'bg-white/15 text-white before:content-[""] before:absolute before:-left-2.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-none before:bg-white'
        : 'text-white/55 hover:bg-white/10 hover:text-white'
      }
    `}
    title={label}
    aria-label={label}
  >
    {icon}
  </button>
);
