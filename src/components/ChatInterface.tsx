import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, HelpCircle, Send, ArrowLeft, ChevronRight, Sparkles, X, Sun, Moon, LogOut, Menu, Plus, Trash2, Users, Share2 } from 'lucide-react';
import { createMessage, updateMessage, updateMessageFeedback } from '../services/messagesService';
import { useTheme } from '../hooks/useTheme';
import { sendMessageStream } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { createConversation, deleteConversation, getMessagesByConversation, getUserConversations, getConversationMembers } from '../services/conversationsService';
import { acceptInvite } from '../services/invitesService';
import { useConversationRealtime } from '../hooks/useConversationRealtime';
import { ShareConversationModal } from './ShareConversationModal';
import type { Message as DBMessage, ConversationMember } from '../types';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


type ViewState = 'home' | 'chat' | 'account';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  dbId?: number; // id de la ligne en base (pour enregistrer le feedback)
  sources?: string[]; // documents utilisés par le RAG pour cette réponse
  authorName?: string;   // nom de l'auteur (conversation partagée)
  authorAvatar?: string; // avatar de l'auteur
  isMine?: boolean;      // message écrit par l'utilisateur courant
}

interface ConversationItem {
  id: string;
  title: string | null;
  created_at?: string;
  is_owner?: boolean;
}

const WELCOME_MESSAGE: Message = {
  id: 1,
  text: "Bonjour ! Je suis Epibot. Comment puis-je vous aider aujourd'hui ?",
  sender: 'bot',
  timestamp: new Date(),
};

/** Convertit une ligne DB en message d'affichage. */
function toDisplayMessage(msg: DBMessage, currentUserId: string | null): Message {
  return {
    id: msg.id || Date.now(),
    dbId: msg.id,
    text: msg.content,
    sender: msg.user_id ? 'user' : 'bot',
    timestamp: msg.created_at ? new Date(msg.created_at) : new Date(),
    sources: (msg.rag_sources as string[] | undefined) || undefined,
    authorName: msg.author?.name || undefined,
    authorAvatar: msg.author?.avatar_url || undefined,
    isMine: !!msg.user_id && msg.user_id === currentUserId,
  };
}

interface GeneralFAQItem {
  id: number;
  question: string;
  answer: string;
  category: string;
}

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  options: string[];
  correctIndex: number;
}

const GENERAL_FAQS: GeneralFAQItem[] = [
  {
    id: 1,
    category: 'Scolarité',
    question: "Comment accéder à mon emploi du temps ?",
    answer: "Via l'intranet, section Planning, ou directement en me demandant votre planning du jour."
  },
  {
    id: 2,
    category: 'Technique',
    question: "Je n'arrive pas à me connecter au Wi‑Fi.",
    answer: "Utilisez le réseau sécurisé et vos identifiants Epitech. En cas d'erreur, relancez la connexion."
  },
  {
    id: 3,
    category: 'Administratif',
    question: "Où déposer ma convention de stage ?",
    answer: "Sur le portail carrières au format PDF, avant la date limite indiquée."
  },
  {
    id: 4,
    category: 'Campus',
    question: "Quels sont les horaires d'ouverture ?",
    answer: "Les horaires exacts sont indiqués sur l'intranet et peuvent varier selon le site."
  }
];

const INITIAL_FAQS: FAQItem[] = [
  {
    id: 1,
    category: 'Bases C',
    question: "À quoi sert un pointeur en C ?",
    options: [
      "À stocker une valeur entière",
      "À stocker une adresse mémoire",
      "À compiler le programme",
      "À afficher du texte"
    ],
    correctIndex: 1,
    answer: "Un pointeur contient une adresse mémoire. Il permet d’accéder/modifier une valeur via son adresse."
  },
  {
    id: 2,
    category: 'Bases C',
    question: "Quelle est la bonne fin d'une chaîne en C ?",
    options: ["\\n", "\\0", "\\t", "\\r"],
    correctIndex: 1,
    answer: "Une chaîne en C se termine par le caractère nul '\\0'."
  },
  {
    id: 3,
    category: 'Bases C',
    question: "malloc sert à :",
    options: [
      "Allouer de la mémoire dynamiquement",
      "Libérer de la mémoire",
      "Déclarer une variable locale",
      "Changer le type d'une variable"
    ],
    correctIndex: 0,
    answer: "malloc alloue de la mémoire dynamique sur le tas."
  },
  {
    id: 4,
    category: 'Bases C',
    question: "Pourquoi faut‑il initialiser une variable ?",
    options: [
      "Pour éviter une valeur indéterminée",
      "Pour accélérer la compilation",
      "Pour activer les pointeurs",
      "Ce n'est pas nécessaire"
    ],
    correctIndex: 0,
    answer: "Sans initialisation, la variable contient une valeur indéterminée."
  },
  {
    id: 5,
    category: 'Bases C',
    question: "Un segfault vient souvent de :",
    options: [
      "Un printf trop long",
      "Un accès mémoire invalide",
      "Un commentaire mal écrit",
      "Un include en trop"
    ],
    correctIndex: 1,
    answer: "Le segfault est un accès mémoire invalide (pointeur null, dépassement, etc.)."
  },
  {
    id: 6,
    category: 'Bases C',
    question: "Différence entre tableau et pointeur ?",
    options: [
      "C'est exactement pareil",
      "Un tableau est une zone contiguë, un pointeur est une adresse",
      "Un pointeur est toujours un tableau",
      "Un tableau stocke des adresses uniquement"
    ],
    correctIndex: 1,
    answer: "Un tableau est une zone mémoire contiguë, un pointeur est une variable qui contient une adresse."
  }
];

export function ChatInterface() {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [view, setView] = useState<ViewState>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lastBotMessageId, setLastBotMessageId] = useState<number | null>(null);
  const [lastFeedback, setLastFeedback] = useState<'yes' | 'no' | null>(null);
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [sessionStart, setSessionStart] = useState(Date.now());
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeMembers, setActiveMembers] = useState<ConversationMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        email: user.email || '',
      });
      setAvatarPreview(user.user_metadata?.avatar_url || '');
      setSessionStart(Date.now());
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user]);

  // Acceptation d'une invitation via ?invite=<token> dans l'URL
  useEffect(() => {
    if (!user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (!token) return;
    (async () => {
      try {
        const convId = await acceptInvite(token);
        await loadConversations();
        setActiveConversationId(convId);
        setView('chat');
      } catch (e) {
        console.error("Impossible de rejoindre la conversation:", e);
        alert(e instanceof Error ? e.message : "Invitation invalide.");
      } finally {
        // Nettoyer l'URL pour ne pas re-déclencher l'acceptation
        params.delete('invite');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Réception temps réel des messages des autres membres (et du bot)
  const handleRealtimeInsert = useCallback((row: DBMessage) => {
    if (!row.id) return;
    setMessages((prev) => {
      // Déduplication : ignorer un message déjà présent (le nôtre, déjà affiché)
      if (prev.some((m) => m.dbId === row.id)) return prev;
      return [...prev, toDisplayMessage(row, user?.id || null)];
    });
  }, [user?.id]);

  useConversationRealtime(view === 'chat' ? activeConversationId : null, handleRealtimeInsert);

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - sessionStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [view]);

  useEffect(() => {
    if (view === 'chat' && activeConversationId) {
      loadMessagesFromSupabase(activeConversationId);
      getConversationMembers(activeConversationId)
        .then(setActiveMembers)
        .catch(() => setActiveMembers([]));
    } else {
      setActiveMembers([]);
    }
  }, [view, activeConversationId]);

  const loadConversations = async () => {
    try {
      if (!user?.id) return;
      const data = await getUserConversations(user.id);
      const items = data.map((c) => ({
        id: c.id as string,
        title: c.title,
        created_at: c.created_at,
        is_owner: c.is_owner,
      }));
      setConversations(items);
      if (!activeConversationId && items.length > 0) {
        setActiveConversationId(items[0].id);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des conversations:', error);
    }
  };

  const createNewConversation = async (title: string) => {
    if (!user?.id) return null;
    const convo = await createConversation(user.id, title);
    const item = { id: convo.id as string, title: convo.title, created_at: convo.created_at, is_owner: true };
    setConversations((prev) => [item, ...prev]);
    setActiveConversationId(item.id);
    setMessages([WELCOME_MESSAGE]);
    setLastBotMessageId(null);
    setLastFeedback(null);
    return item.id;
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!window.confirm('Supprimer cette conversation ?')) return;
    try {
      await deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        const next = conversations.find((c) => c.id !== conversationId);
        if (next) {
          setActiveConversationId(next.id);
        } else {
          setActiveConversationId(null);
          setMessages([WELCOME_MESSAGE]);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la suppression de la conversation:', error);
      alert("Impossible de supprimer la conversation.");
    }
  };

  const loadMessagesFromSupabase = async (conversationId: string) => {
    try {
      const supabaseMessages = await getMessagesByConversation(conversationId);
      const formattedMessages: Message[] = supabaseMessages.map((msg) =>
        toDisplayMessage(msg, user?.id || null)
      );

      setMessages([WELCOME_MESSAGE, ...formattedMessages]);
      const lastBot = [...formattedMessages].reverse().find((msg) => msg.sender === 'bot');
      if (lastBot?.id) {
        setLastBotMessageId(lastBot.id);
        setLastFeedback(null);
      } else {
        setLastBotMessageId(null);
        setLastFeedback(null);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error);
    }
  };

  const handleSendMessage = async (text: string = inputValue) => {
    if (!text.trim()) return;

    const localUserMsgId = Date.now();
    const newUserMsg: Message = {
      id: localUserMsgId,
      text: text,
      sender: 'user',
      timestamp: new Date(),
      isMine: true,
      authorName: profile.name || undefined,
      authorAvatar: avatarPreview || undefined,
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    setIsTyping(true);

    const currentUserId = user?.id || null;
    let savedUserMessageId: number | null = null;
    // Sauvegarder le message utilisateur dans Supabase (optionnel, ne bloque pas le chat)
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = await createNewConversation(text.slice(0, 48));
      }
      const savedUser = await createMessage({
        content: text,
        user_id: currentUserId, // Utiliser l'ID de l'utilisateur connecté
        conversation_id: conversationId,
      });
      savedUserMessageId = savedUser.id ?? null;
      // Attacher le dbId à la bulle locale -> évite un doublon via le realtime
      if (savedUserMessageId) {
        setMessages(prev => prev.map(m => m.id === localUserMsgId ? { ...m, dbId: savedUserMessageId! } : m));
      }
    } catch (error) {
      // Ne pas bloquer le chat si la sauvegarde échoue
      console.warn('Erreur lors de la sauvegarde du message (non bloquant):', error);
    }

    try {
      // Nom de l'utilisateur courant (pour préfixer ses propres messages)
      const myName = profile.name?.trim() || 'Moi';
      // Une conversation est "partagée" dès qu'un autre membre y participe.
      const isShared = activeMembers.length > 1;

      // Construire l'historique. On garde les 2 rôles de l'API (user/assistant),
      // mais on préfixe chaque message humain par le NOM de son auteur : sinon,
      // en conversation partagée, tous les humains ont le rôle "user" et l'IA
      // ne sait plus qui a dit quoi (elle confond les intervenants). Même en solo,
      // ça aide l'IA à distinguer "ce que l'utilisateur a demandé" de ses propres
      // questions de relance.
      const label = (msg: Message) => {
        if (msg.sender !== 'user') return '';
        const who = msg.isMine ? myName : (msg.authorName || 'Un autre étudiant');
        return isShared ? `${who} : ` : '';
      };

      const conversationHistory = messages
        .filter(msg => msg.id !== 1) // Exclure le message de bienvenue
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
          content: `${label(msg)}${msg.text}`,
        }));

      // Le message courant est le mien -> même préfixe nominatif en conversation partagée.
      const outgoing = isShared ? `${myName} : ${text}` : text;

      // Streamer la réponse mot à mot ; la bulle du bot est créée au 1er token
      const botMsgId = Date.now() + 1;
      let created = false;
      const result = await sendMessageStream(outgoing, conversationHistory, (delta) => {
        if (!created) {
          created = true;
          setIsTyping(false);
          setMessages(prev => [...prev, {
            id: botMsgId,
            text: delta,
            sender: 'bot',
            timestamp: new Date(),
          }]);
        } else {
          setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: m.text + delta } : m));
        }
      });

      // Réponse sans aucun token : créer quand même la bulle
      if (!created) {
        setMessages(prev => [...prev, {
          id: botMsgId,
          text: result.response || '…',
          sender: 'bot',
          timestamp: new Date(),
        }]);
      }

      // Finaliser : sources + suivi du feedback
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, sources: result.sources } : m));
      setLastBotMessageId(botMsgId);
      setLastFeedback(null);

      // Modération : marquer la question si le backend a détecté un contournement
      if (result.flagged && savedUserMessageId) {
        try {
          await updateMessage(savedUserMessageId, { flagged: true });
        } catch (err) {
          console.warn('Erreur maj flag modération (non bloquant):', err);
        }
      }

      // Sauvegarder la réponse du bot + métadonnées RAG (optionnel, ne bloque pas le chat)
      try {
        let conversationId = activeConversationId;
        if (!conversationId) {
          conversationId = await createNewConversation(text.slice(0, 48));
        }
        const savedBot = await createMessage({
          content: result.response,
          user_id: null, // Message du bot
          conversation_id: conversationId || null,
          rag_similarity: result.maxSimilarity,
          rag_sources: result.sources,
          rag_context_found: result.contextFound,
        });
        // Mémoriser l'id en base pour pouvoir enregistrer le feedback ensuite
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, dbId: savedBot.id } : m));
      } catch (error) {
        // Ne pas bloquer le chat si la sauvegarde échoue
        console.warn('Erreur lors de la sauvegarde de la réponse (non bloquant):', error);
      }
    } catch (error) {
      // En cas d'erreur avec l'API, afficher un message d'erreur
      let errorText = 'Désolé, une erreur est survenue. Veuillez réessayer.';
      
      if (error instanceof Error) {
        errorText = error.message;
        
        // Messages d'aide spécifiques
        if (error.message.includes('non configurée') || error.message.includes('non trouvee')) {
          errorText = 'Cle API Google non configuree. Ajoutez GOOGLE_API_KEY dans backend/.env et redemarrez le backend.';
        } else if (error.message.includes('invalide')) {
          errorText = 'Cle API Google invalide. Verifiez votre cle API dans backend/.env';
        } else if (error.message.includes('connexion') || error.message.includes('connecter')) {
          errorText = 'Probleme de connexion. Verifiez que le backend est demarre (npm run dev:api)';
        }
      }
      
      const errorMsg: Message = {
        id: Date.now() + 1,
        text: errorText,
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const startChatWithQuestion = async (question: string) => {
    setView('chat');
    if (!activeConversationId) {
      await createNewConversation(question.slice(0, 48));
    }
    handleSendMessage(question);
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleAvatarUrl = (value: string) => {
    setAvatarUrl(value);
    if (value.trim()) {
      setAvatarPreview(value.trim());
    }
  };

  const handleFeedback = async (value: 'yes' | 'no') => {
    setLastFeedback(value);
    const botMsg = messages.find(m => m.id === lastBotMessageId);
    if (botMsg?.dbId) {
      try {
        await updateMessageFeedback(botMsg.dbId, value === 'yes' ? 'up' : 'down');
      } catch (error) {
        console.warn('Erreur lors de l\'enregistrement du feedback (non bloquant):', error);
      }
    }
  };


  return (
    <div className="min-h-screen bg-ground text-ink font-sans selection:bg-accent-soft transition-colors">
      {/* Header Global */}
      <header className="bg-surface/80 backdrop-blur-md border-b border-hairline sticky top-0 z-50 transition-colors">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('home')}>
            <img src="/epitech-logo.png" alt="Epitech" className="h-8 w-auto" />
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-accent to-maize shadow-sm shadow-accent/30">
              <img src="/epis_mais.png" alt="Epis de maïs" className="w-5 h-5" />
            </div>
            <span className="font-display font-semibold text-xl text-ink">Epibot</span>
          </div>
          <div className="flex items-center gap-4 relative">
            {view !== 'home' && (
              <button
                onClick={() => setView('home')}
                className="text-sm font-medium text-ink-2 hover:text-accent transition-colors flex items-center gap-1"
              >
                <ArrowLeft size={16} />
                Retour à l'accueil
              </button>
            )}
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="p-2 rounded-lg bg-surface-2 hover:bg-hairline transition-colors"
              aria-label="Menu"
            >
              <Menu size={20} className="text-ink-2" />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 top-12 w-40 bg-surface border border-hairline rounded-xl shadow-lg p-2 z-50">
                <button
                  onClick={() => setView('home')}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-2 hover:bg-surface-2 transition-colors"
                >
                  Accueil
                </button>
                <button
                  onClick={() => setView('account')}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-2 hover:bg-surface-2 transition-colors"
                >
                  Mon compte
                </button>
              </div>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-surface-2 hover:bg-hairline transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={20} className="text-ink-2" /> : <Sun size={20} className="text-maize" />}
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-lg bg-surface-2 hover:bg-critical-soft hover:text-critical transition-colors"
              aria-label="Se deconnecter"
              title="Se deconnecter"
            >
              <LogOut size={20} className="text-ink-2" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenu Principal */}
      <main className="max-w-[95%] mx-auto px-8 py-10">
        {view === 'home' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Section 1: Invitation au Chat (Hero) */}
              <section className="lg:col-span-5 flex flex-col">
                <div className="bg-surface rounded-3xl shadow-lg border border-hairline p-12 min-h-[600px] flex flex-col justify-center items-start text-left relative overflow-hidden transition-colors">
                  <div className="absolute -top-20 -right-20 w-60 h-60 bg-accent-soft rounded-full blur-3xl opacity-60"></div>
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-maize-soft rounded-full blur-2xl opacity-60"></div>

                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-soft text-accent-ink text-sm font-semibold mb-8">
                    <Sparkles size={16} />
                    Assistant pédagogique · collaboratif
                  </div>

                  <h1 className="font-display text-6xl font-semibold text-ink leading-[1.05] mb-6">
                    Besoin d'aide ? <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-maize">
                      Discutez avec Epibot.
                    </span>
                  </h1>

                  <p className="text-ink-2 text-xl mb-12 leading-relaxed max-w-lg">
                    Posez vos questions sur les projets et les cours — seul ou à plusieurs. Epibot vous guide sans jamais faire le travail à votre place.
                  </p>

                  <button
                    onClick={() => setView('chat')}
                    className="group relative w-full sm:w-auto flex items-center justify-center gap-3 bg-accent hover:bg-accent-ink text-white px-10 py-5 rounded-xl font-semibold text-lg transition-all shadow-lg shadow-accent/25 hover:shadow-accent/40 transform hover:-translate-y-0.5"
                  >
                    <MessageCircle size={24} />
                    Commencer une discussion
                    <ChevronRight size={18} className="opacity-0 group-hover:opacity-100 transition-opacity -ml-2 group-hover:ml-0" />
                  </button>
                </div>
              </section>

              {/* Section 2: FAQ */}
              <section className="lg:col-span-7">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-maize-soft text-maize rounded-xl">
                    <HelpCircle size={24} />
                  </div>
                  <h2 className="font-display text-4xl font-semibold text-ink">Questions fréquentes</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {GENERAL_FAQS.map((faq) => (
                    <GeneralFAQCard
                      key={faq.id}
                      faq={faq}
                      onAsk={() => startChatWithQuestion(faq.question)}
                    />
                  ))}
                </div>

                <div className="mt-10 flex items-center gap-3">
                  <div className="p-2 bg-accent-soft text-accent-ink rounded-lg">
                    <HelpCircle size={18} />
                  </div>
                  <h3 className="font-display text-2xl font-semibold text-ink">QCM Bases C</h3>
                </div>
                <p className="mt-2 text-sm text-ink-3">
                  Testez vos bases rapidement avant de poser une question.
                </p>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {INITIAL_FAQS.map((faq) => (
                    <FAQCard
                      key={faq.id}
                      faq={faq}
                      onAsk={() => startChatWithQuestion(faq.question)}
                    />
                  ))}
                </div>

                <div className="mt-8 bg-surface-2 rounded-xl p-6 flex items-start gap-4 border border-hairline transition-colors">
                  <div className="mt-1">
                    <img src="/epis_mais.png" alt="Epibot" className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink text-base mb-2">Le saviez-vous ?</h3>
                    <p className="text-base text-ink-2 leading-relaxed">
                      Vous pouvez désormais <b>partager une conversation</b> : invitez d'autres étudiants et interrogez Epibot ensemble, en temps réel.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : view === 'chat' ? (
          /* Vue Chat */
          <div className="h-[calc(100vh-7rem)] flex gap-4">
            {/* Sidebar conversations */}
            <aside className="w-72 bg-surface rounded-2xl shadow-xl border border-hairline p-4 flex flex-col">
              <button
                onClick={() => createNewConversation('Nouvelle conversation')}
                className="mb-4 flex items-center gap-2 text-sm font-semibold text-accent hover:text-accent-ink"
              >
                <Plus size={16} />
                Nouvelle conversation
              </button>
              <div className="flex-1 overflow-y-auto space-y-1">
                {conversations.length === 0 && (
                  <div className="text-xs text-ink-3">
                    Aucune conversation
                  </div>
                )}
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeConversationId === conv.id
                        ? 'bg-accent-soft text-accent-ink font-semibold'
                        : 'hover:bg-surface-2 text-ink-2'
                    }`}
                  >
                    <button
                      onClick={() => setActiveConversationId(conv.id)}
                      className="flex-1 text-left truncate flex items-center gap-1.5"
                      title={conv.title || 'Conversation'}
                    >
                      {conv.is_owner === false && (
                        <Users size={13} className="flex-shrink-0 text-positive" />
                      )}
                      <span className="truncate">{conv.title || 'Conversation'}</span>
                    </button>
                    {conv.is_owner !== false && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                        className="p-1 rounded-md hover:bg-critical-soft text-ink-3 hover:text-critical"
                        title="Supprimer"
                        aria-label="Supprimer la conversation"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            {/* Chat */}
            <div className="flex-1 flex flex-col bg-surface rounded-2xl shadow-xl border border-hairline overflow-hidden transition-colors">
              {/* Header du Chat */}
              <div className="bg-gradient-to-r from-accent to-maize p-4 text-white flex items-center justify-between shadow-md z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <img src="/epis_mais.png" alt="Epibot" className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-[15px] leading-tight">Epibot</h3>
                    <div className="flex items-center gap-1.5 opacity-90">
                      <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse"></span>
                      <span className="text-xs font-medium">
                        {activeMembers.length > 1
                          ? `En ligne · ${activeMembers.length} participants`
                          : 'En ligne'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Présence : avatars empilés des membres */}
                  {activeMembers.length > 1 && (
                    <div className="hidden sm:flex items-center pr-1">
                      {activeMembers.slice(0, 4).map((m, i) => (
                        <div
                          key={m.user_id}
                          className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold text-white overflow-hidden"
                          style={{
                            marginLeft: i === 0 ? 0 : -8,
                            borderColor: 'color-mix(in oklab, var(--color-accent) 70%, #fff)',
                            background: m.user_id === user?.id ? 'var(--color-maize)' : 'var(--color-positive)',
                          }}
                          title={m.user?.name || 'Étudiant'}
                        >
                          {m.user?.avatar_url ? (
                            <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (m.user?.name || '?').slice(0, 1).toUpperCase()
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {activeConversationId && (
                    <button
                      onClick={() => setShareOpen(true)}
                      className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg transition-colors flex items-center gap-1.5 text-[13px] font-semibold"
                      title="Partager la conversation"
                    >
                      <Share2 size={16} />
                      <span className="hidden sm:inline">Partager</span>
                    </button>
                  )}
                  <button onClick={() => setView('home')} className="p-2 hover:bg-white/15 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Zone des messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-surface-2 transition-colors">
                {messages.map((msg) => {
                  // Mon message = à droite. Message d'un autre membre ou du bot = à gauche.
                  const isMine = msg.sender === 'user' && msg.isMine;
                  const isOther = msg.sender === 'user' && !msg.isMine;
                  const isBot = msg.sender === 'bot';
                  return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="max-w-[80%]">
                      {/* Attribution de l'auteur : autres membres (nom) OU bot */}
                      {(isOther || isBot) && (
                        <div className="flex items-center gap-1.5 mb-1 ml-1">
                          <div
                            className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center text-[9px] font-bold text-white"
                            style={{
                              background: isBot
                                ? 'linear-gradient(150deg, var(--color-accent), var(--color-maize))'
                                : 'var(--color-positive)',
                            }}
                          >
                            {isBot ? (
                              <img src="/epis_mais.png" alt="" className="w-3.5 h-3.5" />
                            ) : msg.authorAvatar ? (
                              <img src={msg.authorAvatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (msg.authorName || '?').slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <span className="text-xs font-medium text-ink-3">
                            {isBot ? 'Epibot' : (msg.authorName || 'Étudiant')}
                          </span>
                        </div>
                      )}
                    <div className={`
                      rounded-2xl p-4 shadow-sm
                      ${isMine
                        ? 'bg-accent text-white rounded-br-none'
                        : isOther
                        ? 'bg-positive-soft text-ink border border-positive/25 rounded-bl-none'
                        : 'bg-surface text-ink border border-hairline rounded-bl-none'}
                    `}>
                      <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                      {msg.sender === 'bot' && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {msg.sources.map((source) => (
                            <span
                              key={source}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink border border-accent/20"
                            >
                              📎 {source}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className={`text-[10px] block mt-2 ${isMine ? 'text-white/70' : 'text-ink-3'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    </div>
                  </div>
                  );
                })}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-surface border border-hairline rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-1 transition-colors">
                      <span className="w-2 h-2 bg-ink-3 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-ink-3 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-ink-3 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {lastBotMessageId && !isTyping && (
                <div className="px-4 py-2 bg-surface-2 border-t border-hairline text-xs text-ink-3 flex items-center gap-2">
                  {lastFeedback ? (
                    <span>
                      {lastFeedback === 'yes'
                        ? 'Merci pour votre retour.'
                        : 'Merci, votre retour nous aide à nous améliorer.'}
                    </span>
                  ) : (
                    <>
                      <span>Cette réponse vous a-t-elle été utile ?</span>
                      <button
                        onClick={() => handleFeedback('yes')}
                        className="px-2.5 py-1 rounded-md border text-xs font-medium transition-colors bg-surface border-hairline text-ink-2 hover:bg-positive-soft hover:text-positive hover:border-positive/30"
                      >
                        Oui
                      </button>
                      <button
                        onClick={() => handleFeedback('no')}
                        className="px-2.5 py-1 rounded-md border text-xs font-medium transition-colors bg-surface border-hairline text-ink-2 hover:bg-critical-soft hover:text-critical hover:border-critical/30"
                      >
                        Non
                      </button>
                    </>
                  )}
                </div>
              )}
              {/* Zone de saisie */}
              <div className="p-4 bg-surface border-t border-hairline transition-colors">
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Posez votre question à Epibot..."
                    className="flex-1 bg-surface-2 border border-hairline focus:border-accent focus:ring-2 focus:ring-accent/20 rounded-xl px-4 py-3 outline-none transition-all text-ink placeholder:text-ink-3"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isTyping}
                    className="bg-accent hover:bg-accent-ink disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl p-3 transition-colors flex items-center justify-center aspect-square"
                  >
                    <Send size={20} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="bg-surface rounded-2xl shadow-xl border border-hairline p-8 transition-colors">
              <h2 className="font-display text-2xl font-semibold text-ink mb-6">Mon compte</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-surface-2 overflow-hidden flex items-center justify-center">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-ink-2">
                          {(profile.name || profile.email || 'U').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-ink-3">Avatar</p>
                      <label className="text-sm font-medium text-accent cursor-pointer">
                        Changer
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-ink-3">URL de l'avatar</label>
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => handleAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1 w-full bg-surface-2 border border-hairline focus:border-accent rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-3 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-ink-3">Nom</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                      className="mt-1 w-full bg-surface-2 border border-hairline focus:border-accent rounded-lg px-3 py-2 text-sm text-ink outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-ink-3">Email</label>
                    <input
                      type="email"
                      value={profile.email}
                      readOnly
                      className="mt-1 w-full bg-surface-2 border border-hairline rounded-lg px-3 py-2 text-sm text-ink-3 cursor-not-allowed"
                    />
                  </div>
                  <div className="text-sm text-ink-2">
                    Temps de connexion : <span className="font-semibold tnum">{formatDuration(sessionSeconds)}</span>
                  </div>
                  <button
                    type="button"
                    className="mt-2 px-4 py-2 bg-accent hover:bg-accent-ink text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {shareOpen && activeConversationId && user?.id && (
        <ShareConversationModal
          conversationId={activeConversationId}
          currentUserId={user.id}
          isOwner={conversations.find((c) => c.id === activeConversationId)?.is_owner ?? false}
          onClose={() => setShareOpen(false)}
          onMembersChanged={loadConversations}
        />
      )}
    </div>
  );
}

// Composant Carte FAQ (Questions fréquentes)
const GeneralFAQCard = ({ faq, onAsk }: { faq: GeneralFAQItem; onAsk: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-surface border border-hairline rounded-xl p-6 hover:shadow-lg hover:border-accent/30 transition-all cursor-pointer group min-h-[140px] flex flex-col" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex justify-between items-start gap-3 flex-1">
        <div className="flex-1">
          <span className="inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-surface-2 text-ink-3 mb-3">
            {faq.category}
          </span>
          <h3 className="font-semibold text-lg text-ink group-hover:text-accent transition-colors leading-snug">
            {faq.question}
          </h3>
        </div>
        <div className={`text-ink-3 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>
          <ChevronRight size={20} />
        </div>
      </div>

      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="text-base text-ink-2 bg-surface-2 p-4 rounded-lg border border-hairline leading-relaxed">
            {faq.answer}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAsk();
            }}
            className="text-sm font-medium text-accent mt-3 hover:underline flex items-center gap-2"
          >
            <MessageCircle size={14} />
            Poser cette question dans le chat
          </button>
        </div>
      </div>
    </div>
  );
};

// Composant Carte QCM
const FAQCard = ({ faq, onAsk }: { faq: FAQItem; onAsk: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isCorrect = selectedIndex !== null && selectedIndex === faq.correctIndex;

  return (
    <div className="bg-surface border border-hairline rounded-xl p-6 hover:shadow-lg hover:border-accent/30 transition-all cursor-pointer group min-h-[140px] flex flex-col" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex justify-between items-start gap-3 flex-1">
        <div className="flex-1">
          <span className="inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-surface-2 text-ink-3 mb-3">
            {faq.category}
          </span>
          <h3 className="font-semibold text-lg text-ink group-hover:text-accent transition-colors leading-snug">
            {faq.question}
          </h3>
        </div>
        <div className={`text-ink-3 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>
          <ChevronRight size={20} />
        </div>
      </div>

      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="space-y-2">
            {faq.options.map((option, idx) => (
              <button
                key={option}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex(idx);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  selectedIndex === idx
                    ? (idx === faq.correctIndex
                        ? 'border-positive bg-positive-soft text-positive'
                        : 'border-critical bg-critical-soft text-critical')
                    : 'border-hairline bg-surface-2 text-ink-2 hover:bg-hairline'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          {selectedIndex !== null && (
            <p className={`mt-3 text-sm px-3 py-2 rounded-lg border ${
              isCorrect
                ? 'border-positive/40 bg-positive-soft text-positive'
                : 'border-watch/40 bg-watch-soft text-watch'
            }`}>
              {isCorrect ? 'Bonne réponse.' : 'Pas tout à fait.'} {faq.answer}
            </p>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAsk();
            }}
            className="text-sm font-medium text-accent mt-3 hover:underline flex items-center gap-2"
          >
            <MessageCircle size={14} />
            Poser cette question dans le chat
          </button>
        </div>
      </div>
    </div>
  );
};
