import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Search,
  MessageSquare,
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
  RefreshCw
} from 'lucide-react';
import { getAllMessages } from '../services/messagesService';
import { getAllUsers } from '../services/usersService';
import { createUsageAlerts, getRecentAlerts } from '../services/adminAlertsService';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { listDocuments, uploadDocument, deleteDocument } from '../services/documentsService';
import type { DocumentItem } from '../services/documentsService';
import type { AdminAlert, Message, User } from '../types';

type ViewState = 'dashboard' | 'students' | 'analytics' | 'documents';

const darkMode = {
  // Backgrounds
  bg: {
    main: 'bg-slate-100 dark:bg-slate-900',
    card: 'bg-white dark:bg-slate-800',
    secondary: 'bg-slate-50 dark:bg-slate-900',
    input: 'bg-slate-100 dark:bg-slate-700',
    hover: 'hover:bg-slate-50 dark:hover:bg-slate-700/50',
  },
  // Textes
  text: {
    primary: 'text-slate-900 dark:text-slate-100',
    secondary: 'text-slate-700 dark:text-slate-300',
    muted: 'text-slate-500 dark:text-slate-400',
    input: 'text-slate-900 dark:text-slate-100',
    placeholder: 'placeholder:text-slate-400 dark:placeholder:text-slate-500',
  },
  // Bordures
  border: {
    default: 'border-slate-200 dark:border-slate-700',
    light: 'border-slate-100 dark:border-slate-700',
  },
  // Transitions
  transition: 'transition-colors',
  // Combinaisons courantes
  card: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors',
  container: 'bg-slate-100 dark:bg-slate-900 transition-colors',
};

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
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      darkColor: 'dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
      icon: <CheckCircle size={16} /> 
    },
    moyenne: { 
      label: 'Utilisation Moyenne', 
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      darkColor: 'dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
      icon: <Activity size={16} /> 
    },
    critique: { 
      label: 'Utilisation Critique', 
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      darkColor: 'dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
      icon: <AlertTriangle size={16} /> 
    },
    abusive: { 
      label: 'Utilisation Abusive', 
      color: 'bg-red-100 text-red-700 border-red-200',
      darkColor: 'dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
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
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [messages, setMessages] = useState<MessageWithUser[]>([]);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
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
      
      if (usersWithStats.length > 0 && !selectedUserId) {
        setSelectedUserId(usersWithStats[0].id || null);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculer les tendances depuis les messages
  const calculateTrends = (): TrendData[] => {
    const topicCounts: { [key: string]: number } = {};
    
    messages.forEach(msg => {
      if (msg.content) {
        const content = msg.content.toLowerCase();
        // Détecter les sujets courants
        if (content.includes('stage') || content.includes('convention')) {
          topicCounts['Convention de stage'] = (topicCounts['Convention de stage'] || 0) + 1;
        }
        if (content.includes('wifi') || content.includes('réseau') || content.includes('connexion')) {
          topicCounts['Problème Wi-Fi'] = (topicCounts['Problème Wi-Fi'] || 0) + 1;
        }
        if (content.includes('cafétéria') || content.includes('cantine') || content.includes('horaires')) {
          topicCounts['Horaires Cafétéria'] = (topicCounts['Horaires Cafétéria'] || 0) + 1;
        }
        if (content.includes('inscription') || content.includes('pédagogique')) {
          topicCounts['Inscription Pédagogique'] = (topicCounts['Inscription Pédagogique'] || 0) + 1;
        }
        if (content.includes('badge') || content.includes('carte')) {
          topicCounts['Perte Badge Étudiant'] = (topicCounts['Perte Badge Étudiant'] || 0) + 1;
        }
      }
    });

    return Object.entries(topicCounts)
      .map(([topic, count]) => ({
        topic,
        count,
        trend: 'stable' as const
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const DashboardHome = () => {
    const totalMessages = messages.length;
    const criticalUsers = users.filter(u => u.usageScore > 60).length;
    const botMessages = messages.filter(m => !m.user_id).length;
    const botResponseRate = totalMessages > 0 ? ((botMessages / totalMessages) * 100).toFixed(1) : '0';

    return (
      <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-500 bg-transparent">
        <h1 className={`text-3xl font-bold mb-2 ${darkMode.text.primary} ${darkMode.transition}`}>Bienvenue sur le cockpit Epibot</h1>
        <p className={`mb-10 ${darkMode.text.muted} ${darkMode.transition}`}>Selectionnez une vue pour gerer ou analyser l'activite du chatbot.</p>

        {alerts.length > 0 && (
          <div className="mb-8 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
            <div className="flex items-center gap-2 font-semibold mb-2">
              <AlertTriangle size={18} />
              Alertes usage (aujourd'hui)
            </div>
            <div className="space-y-1">
              {alerts.map((alert) => (
                <div key={alert.id}>{alert.message}</div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div
            onClick={() => setCurrentView('students')}
            className={`group relative ${darkMode.card} rounded-2xl p-8 cursor-pointer hover:shadow-xl hover:border-indigo-300 dark:hover:border-indigo-600 transition-all duration-300`}
          >
            <div className="absolute top-8 right-8 bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-500 group-hover:text-white transition-colors">
              <Users size={32} />
            </div>
            <h2 className={`text-2xl font-bold mb-3 ${darkMode.text.secondary} ${darkMode.transition}`}>Vue Etudiants</h2>
            <p className={`mb-6 pr-12 ${darkMode.text.secondary} ${darkMode.transition}`}>
              Accedez aux details individuels. Analysez les scores d'utilisation, lisez l'historique des conversations et moderez les comptes a risque.
            </p>
            <div className="flex items-center text-indigo-600 dark:text-indigo-400 font-semibold group-hover:translate-x-2 transition-transform">
              Gerer les comptes <ArrowRight size={18} className="ml-2" />
            </div>
          </div>

          <div
            onClick={() => setCurrentView('analytics')}
            className={`group relative ${darkMode.card} rounded-2xl p-8 cursor-pointer hover:shadow-xl hover:border-emerald-300 dark:hover:border-emerald-600 transition-all duration-300`}
          >
            <div className="absolute top-8 right-8 bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 dark:group-hover:bg-emerald-500 group-hover:text-white transition-colors">
              <TrendingUp size={32} />
            </div>
            <h2 className={`text-2xl font-bold mb-3 ${darkMode.text.secondary} ${darkMode.transition}`}>Vue Analytique</h2>
            <p className={`mb-6 pr-12 ${darkMode.text.secondary} ${darkMode.transition}`}>
              Visualisez les tendances globales. Decouvrez les questions les plus frequentes par promo et identifiez les pics d'activite.
            </p>
            <div className="flex items-center text-emerald-600 dark:text-emerald-400 font-semibold group-hover:translate-x-2 transition-transform">
              Voir les statistiques <ArrowRight size={18} className="ml-2" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`${darkMode.card} p-4 rounded-xl shadow-sm flex items-center gap-4`}>
            <div className="p-3 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"><MessageSquare size={20} /></div>
            <div>
              <p className={`text-xs font-bold uppercase ${darkMode.text.muted} ${darkMode.transition}`}>Messages Totaux</p>
              <p className={`text-xl font-bold ${darkMode.text.primary} ${darkMode.transition}`}>{totalMessages}</p>
            </div>
          </div>
          <div className={`${darkMode.card} p-4 rounded-xl shadow-sm flex items-center gap-4`}>
            <div className="p-3 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"><AlertTriangle size={20} /></div>
            <div>
              <p className={`text-xs font-bold uppercase ${darkMode.text.muted} ${darkMode.transition}`}>Utilisations Critiques</p>
              <p className={`text-xl font-bold ${darkMode.text.primary} ${darkMode.transition}`}>{criticalUsers}</p>
            </div>
          </div>
          <div className={`${darkMode.card} p-4 rounded-xl shadow-sm flex items-center gap-4`}>
            <div className="p-3 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <img src="/epis_mais.png" alt="Epibot" className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-xs font-bold uppercase ${darkMode.text.muted} ${darkMode.transition}`}>Taux de reponse Bot</p>
              <p className={`text-xl font-bold ${darkMode.text.primary} ${darkMode.transition}`}>{botResponseRate}%</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AnalyticsView = () => {
    const trends = calculateTrends();
    const promoStats = users.reduce((acc, user) => {
      const label = user.promo ? `Promo ${user.promo}` : 'Autre';
      acc[label] = (acc[label] || 0) + user.messageCount;
      return acc;
    }, {} as { [key: string]: number });

    const totalInteractions = Object.values(promoStats).reduce((sum, count) => sum + count, 0);
    const promoEntries = Object.entries(promoStats).sort((a, b) => b[1] - a[1]);

    const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-emerald-500'];

    return (
      <div className={`flex-1 overflow-y-auto ${darkMode.bg.secondary} p-8 animate-in slide-in-from-right-4 duration-500 ${darkMode.transition}`}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${darkMode.text.primary} ${darkMode.transition}`}>Tendances & Statistiques</h1>
              <p className={`${darkMode.text.muted} ${darkMode.transition}`}>Analyse globale des interactions etudiants.</p>
            </div>
            <button onClick={() => setCurrentView('dashboard')} className={`text-sm font-medium ${darkMode.text.muted} hover:text-indigo-600 dark:hover:text-indigo-400 ${darkMode.transition}`}>
              Retour Dashboard
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className={`${darkMode.card} rounded-2xl p-6 shadow-sm`}>
              <h3 className={`font-bold ${darkMode.text.secondary} mb-6 flex items-center gap-2 ${darkMode.transition}`}>
                <TrendingUp size={20} className="text-emerald-500 dark:text-emerald-400" />
                Sujets les plus frequents
              </h3>
              <div className="space-y-4">
                {trends.length > 0 ? trends.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 group">
                    <span className={`w-6 text-center font-bold text-sm ${darkMode.text.muted} ${darkMode.transition}`}>#{idx + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className={`font-medium ${darkMode.text.secondary} ${darkMode.transition}`}>{item.topic}</span>
                        <span className={`text-xs font-bold ${darkMode.text.muted} ${darkMode.transition}`}>{item.count} msg</span>
                      </div>
                      <div className={`w-full ${darkMode.bg.input} rounded-full h-2 overflow-hidden ${darkMode.transition}`}>
                        <div
                          className="bg-indigo-500 dark:bg-indigo-400 h-2 rounded-full"
                          style={{ width: `${Math.min(100, (item.count / (trends[0]?.count || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full ${darkMode.bg.input} ${darkMode.text.muted} ${darkMode.transition}`}>
                      →
                    </div>
                  </div>
                )) : (
                  <p className={`${darkMode.text.muted} text-center py-8 ${darkMode.transition}`}>Aucune donnee disponible</p>
                )}
              </div>
            </div>

            <div className={`${darkMode.card} rounded-2xl p-6 shadow-sm`}>
              <h3 className={`font-bold ${darkMode.text.secondary} mb-6 flex items-center gap-2 ${darkMode.transition}`}>
                <PieChart size={20} className="text-indigo-500 dark:text-indigo-400" />
                Repartition par Promo
              </h3>
             
              <div className="space-y-6">
                {promoEntries.map(([promo, count], idx) => (
                  <div key={promo}>
                    <div className="flex justify-between items-end mb-2">
                      <span className={`font-semibold ${darkMode.text.secondary} ${darkMode.transition}`}>{promo}</span>
                      <span className={`text-sm ${darkMode.text.muted} ${darkMode.transition}`}>{count} interactions</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`flex-1 ${darkMode.bg.input} rounded-full h-4 overflow-hidden ${darkMode.transition}`}>
                        <div 
                          className={`h-4 rounded-full ${colors[idx % colors.length]}`} 
                          style={{ width: `${totalInteractions > 0 ? (count / totalInteractions) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <span className={`text-xs font-bold ${darkMode.text.muted} w-8 text-right ${darkMode.transition}`}>
                        {totalInteractions > 0 ? Math.round((count / totalInteractions) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
             
              {promoEntries.length > 0 && (
                <div className={`mt-8 p-4 ${darkMode.bg.secondary} rounded-xl ${darkMode.border.light} ${darkMode.transition}`}>
                  <p className={`text-sm ${darkMode.text.secondary} ${darkMode.transition}`}>
                    <strong className={darkMode.text.primary}>Analyse :</strong> La <strong>{promoEntries[0][0]}</strong> genere {Math.round((promoEntries[0][1] / totalInteractions) * 100)}% du trafic total.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const StudentsView = () => {
    const selectedUser = users.find(u => u.id === selectedUserId) || users[0];
    const filteredUsers = users.filter(user =>
      (user.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (user.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
    );

    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className={`${darkMode.text.muted} ${darkMode.transition}`}>Chargement...</p>
        </div>
      );
    }

    if (!selectedUser) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className={`${darkMode.text.muted} ${darkMode.transition}`}>Aucun utilisateur selectionne</p>
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
        <aside className={`w-80 ${darkMode.bg.card} border-r ${darkMode.border.default} flex flex-col z-10 shadow-sm ${darkMode.transition}`}>
          <div className={`p-4 border-b ${darkMode.border.light}`}>
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode.text.muted}`} size={16} />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full ${darkMode.bg.input} border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 outline-none ${darkMode.text.input} ${darkMode.text.placeholder} ${darkMode.transition}`}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredUsers.map(user => {
              const status = getUsageStatus(user.usageScore);
              return (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id || null)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group ${
                    selectedUserId === user.id 
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800' 
                      : `${darkMode.bg.hover} border border-transparent`
                  }`}
                >
                  <div className="relative">
                    <img src={getAvatarUrl(user)} alt={user.name || ''} className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600" />
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${
                      status.status === 'modere' ? 'bg-emerald-500' :
                      status.status === 'moyenne' ? 'bg-blue-500' :
                      status.status === 'critique' ? 'bg-orange-500' : 'bg-red-500'
                    }`}></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-sm font-semibold truncate ${darkMode.transition} ${
                      selectedUserId === user.id 
                        ? 'text-indigo-900 dark:text-indigo-100' 
                        : darkMode.text.secondary
                    }`}>
                      {user.name || user.email}
                    </h3>
                    <p className={`text-xs truncate ${darkMode.text.muted} ${darkMode.transition}`}>
                      {user.promo ? `Promo ${user.promo}` : 'Promo inconnue'}
                    </p>
                  </div>
                  <div className={`text-xs font-bold px-2 py-1 rounded ${darkMode.transition} ${
                    selectedUserId === user.id 
                      ? 'bg-white dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200' 
                      : `${darkMode.bg.input} ${darkMode.text.muted}`
                  }`}>
                    {user.usageScore}%
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={`flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-900 ${darkMode.transition}`}>
          <header className={`${darkMode.bg.card} border-b ${darkMode.border.default} px-8 py-6 flex items-center justify-between shadow-sm ${darkMode.transition}`}>
            <div className="flex items-center gap-4">
              <img src={getAvatarUrl(selectedUser)} alt={selectedUser.name || ''} className="w-16 h-16 rounded-full border-2 border-white dark:border-slate-700 shadow" />
              <div>
                <h2 className={`text-xl font-bold ${darkMode.text.primary} ${darkMode.transition}`}>{selectedUser.name || selectedUser.email}</h2>
                <div className={`flex items-center gap-2 text-sm ${darkMode.text.muted} ${darkMode.transition}`}>
                  <span>{selectedUser.promo ? `Promo ${selectedUser.promo}` : 'Promo inconnue'}</span> • <span>{selectedUser.email}</span>
                </div>
              </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${darkMode.transition} ${userStatus.color} ${userStatus.darkColor}`}>
              {userStatus.icon}
              <span className="font-bold text-sm">{userStatus.label}</span>
              <span className="text-sm ml-1 opacity-75">({selectedUser.usageScore}%)</span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            <div className={`${darkMode.card} rounded-2xl shadow-sm flex flex-col h-full`}>
              <div className={`p-4 border-b ${darkMode.border.light} bg-slate-50/30 dark:bg-slate-900/50 font-semibold ${darkMode.text.secondary} ${darkMode.transition}`}>Historique des messages</div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {userMessages.length > 0 ? userMessages.map((msg, idx) => {
                  const isUser = !!msg.user_id;
                  const timestamp = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
                  
                  return (
                    <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] p-3 rounded-xl text-sm ${darkMode.transition} ${
                        isUser 
                          ? 'bg-indigo-600 dark:bg-indigo-700 text-white rounded-tr-none' 
                          : `${darkMode.bg.input} ${darkMode.text.secondary} rounded-tl-none`
                      }`}>
                        <div className="mb-1 text-[10px] opacity-70 uppercase font-bold">
                          {isUser ? (selectedUser.name || selectedUser.email) : 'Epibot'}
                        </div>
                        {msg.content}
                        {timestamp && (
                          <div className="mt-1 text-[10px] opacity-60 text-right">{timestamp}</div>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <p className={`${darkMode.text.muted} text-center py-8 ${darkMode.transition}`}>Aucun message dans l'historique</p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  };

  return (
    <div className={`flex h-screen font-sans ${darkMode.bg.main} ${darkMode.text.primary} ${darkMode.transition}`}>
      <nav className="w-20 bg-indigo-900 dark:bg-indigo-950 flex flex-col items-center py-6 gap-8 z-50 justify-between transition-colors">
        <div className="flex flex-col items-center gap-8">
          <div className="w-10 h-10 bg-white/10 dark:bg-white/20 rounded-xl flex items-center justify-center text-white mb-4">
            <img src="/epis_mais.png" alt="Epibot" className="w-6 h-6" />
          </div>
         
          <div className="flex flex-col gap-4 w-full px-3">
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
              active={currentView === 'documents'}
              onClick={() => setCurrentView('documents')}
              icon={<FileText size={20} />}
              label="Docs"
            />
          </div>
        </div>
        
        <div className="flex flex-col gap-2 w-full px-3">
          <button
            onClick={toggleTheme}
            className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 text-indigo-200 hover:bg-indigo-800/30 hover:text-white"
            title={theme === 'light' ? 'Mode sombre' : 'Mode clair'}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            <span className="text-[10px] font-medium">{theme === 'light' ? 'Sombre' : 'Clair'}</span>
          </button>
          <button
            onClick={signOut}
            className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 text-indigo-200 hover:bg-red-500/20 hover:text-red-200"
            title="Se deconnecter"
          >
            <LogOut size={20} />
            <span className="text-[10px] font-medium">Deconnexion</span>
          </button>
        </div>
      </nav>

      <div className={`flex-1 flex flex-col overflow-hidden relative ${darkMode.container}`}>
        {currentView === 'dashboard' && <DashboardHome />}
        {currentView === 'students' && <StudentsView />}
        {currentView === 'analytics' && <AnalyticsView />}
        {currentView === 'documents' && <DocumentsView />}
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

  const totalChunks = docs.reduce((sum, d) => sum + d.chunks, 0);

  return (
    <div className={`flex-1 overflow-y-auto ${darkMode.bg.secondary} p-8 ${darkMode.transition}`}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-bold ${darkMode.text.primary} ${darkMode.transition}`}>Base de connaissances</h1>
            <p className={`${darkMode.text.muted} ${darkMode.transition}`}>
              {docs.length} document(s) · {totalChunks} passage(s) indexé(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className={`p-2 rounded-lg ${darkMode.bg.input} ${darkMode.text.secondary} hover:opacity-80 ${darkMode.transition}`}
              title="Rafraîchir"
            >
              <RefreshCw size={18} />
            </button>
            <label
              className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <Upload size={16} />
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

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className={`${darkMode.card} rounded-2xl shadow-sm overflow-hidden`}>
          <div className={`grid grid-cols-12 px-6 py-3 border-b ${darkMode.border.light} text-xs font-bold uppercase ${darkMode.text.muted} ${darkMode.transition}`}>
            <div className="col-span-6">Document</div>
            <div className="col-span-2 text-center">Passages</div>
            <div className="col-span-3">Ajouté le</div>
            <div className="col-span-1"></div>
          </div>

          {loading ? (
            <div className={`px-6 py-10 text-center ${darkMode.text.muted} ${darkMode.transition}`}>Chargement…</div>
          ) : docs.length === 0 ? (
            <div className={`px-6 py-10 text-center ${darkMode.text.muted} ${darkMode.transition}`}>
              Aucun document. Clique sur « Ajouter un document » pour enrichir le chatbot.
            </div>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className={`grid grid-cols-12 items-center px-6 py-4 border-b ${darkMode.border.light} ${darkMode.bg.hover} ${darkMode.transition}`}
              >
                <div className="col-span-6 flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className={`font-medium truncate ${darkMode.text.primary} ${darkMode.transition}`}>{doc.titre}</div>
                    <div className={`text-xs truncate ${darkMode.text.muted}`}>{doc.source}</div>
                  </div>
                </div>
                <div className={`col-span-2 text-center font-semibold ${darkMode.text.secondary} ${darkMode.transition}`}>{doc.chunks}</div>
                <div className={`col-span-3 text-sm ${darkMode.text.muted} ${darkMode.transition}`}>
                  {doc.created_at ? new Date(doc.created_at).toLocaleDateString('fr-FR') : '—'}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => handleDelete(doc.id, doc.titre)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <p className={`mt-4 text-xs ${darkMode.text.muted} ${darkMode.transition}`}>
          Formats acceptés : PDF, .txt, .md. Un fichier de même nom remplace l'ancien.
        </p>
      </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button
    onClick={onClick}
    className={`
      w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200
      ${active 
        ? `${darkMode.bg.card} text-indigo-900 dark:text-indigo-100 shadow-lg translate-x-1` 
        : 'text-indigo-200 dark:text-indigo-300 hover:bg-white/10 dark:hover:bg-white/20 hover:text-white'
      }
    `}
    title={label}
  >
    {icon}
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);
