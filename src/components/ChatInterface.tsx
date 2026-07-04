import { useState, useRef, useEffect } from 'react';
import { MessageCircle, HelpCircle, Send, ArrowLeft, ChevronRight, Sparkles, X, Sun, Moon, LogOut, Menu, Plus, Trash2 } from 'lucide-react';
import { createMessage, updateMessage, updateMessageFeedback } from '../services/messagesService';
import { useTheme } from '../hooks/useTheme';
import { sendMessageStream } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { createConversation, deleteConversation, getMessagesByConversation, getUserConversations } from '../services/conversationsService';
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
}

interface ConversationItem {
  id: string;
  title: string | null;
  created_at?: string;
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
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "Bonjour ! Je suis Epibot. Comment puis-je vous aider aujourd'hui ?", sender: 'bot', timestamp: new Date() }
  ]);
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
    const item = { id: convo.id as string, title: convo.title, created_at: convo.created_at };
    setConversations((prev) => [item, ...prev]);
    setActiveConversationId(item.id);
    setMessages([
      { id: 1, text: "Bonjour ! Je suis Epibot. Comment puis-je vous aider aujourd'hui ?", sender: 'bot', timestamp: new Date() }
    ]);
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
          setMessages([
            { id: 1, text: "Bonjour ! Je suis Epibot. Comment puis-je vous aider aujourd'hui ?", sender: 'bot', timestamp: new Date() }
          ]);
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
      const formattedMessages: Message[] = supabaseMessages.map((msg) => ({
        id: msg.id || Date.now(),
        dbId: msg.id,
        text: msg.content,
        sender: msg.user_id ? 'user' : 'bot', // Si user_id existe, c'est un message utilisateur, sinon c'est le bot
        timestamp: msg.created_at ? new Date(msg.created_at) : new Date(),
        sources: msg.rag_sources || undefined,
      }));
      
      setMessages([
        { id: 1, text: "Bonjour ! Je suis Epibot. Comment puis-je vous aider aujourd'hui ?", sender: 'bot', timestamp: new Date() },
        ...formattedMessages
      ]);
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

    const newUserMsg: Message = {
      id: Date.now(),
      text: text,
      sender: 'user',
      timestamp: new Date()
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
    } catch (error) {
      // Ne pas bloquer le chat si la sauvegarde échoue
      console.warn('Erreur lors de la sauvegarde du message (non bloquant):', error);
    }

    try {
      // Construire l'historique de conversation (exclure le message de bienvenue)
      const conversationHistory = messages
        .filter(msg => msg.id !== 1) // Exclure le message de bienvenue
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.text,
        }));

      // Streamer la réponse mot à mot ; la bulle du bot est créée au 1er token
      const botMsgId = Date.now() + 1;
      let created = false;
      const result = await sendMessageStream(text, conversationHistory, (delta) => {
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-100 dark:selection:bg-indigo-900 transition-colors">
      {/* Header Global */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 transition-colors">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('home')}>
            <img src="/epitech-logo.png" alt="Epitech" className="h-8 w-auto" />
            <div className="w-8 h-8 bg-indigo-600 dark:bg-indigo-500 rounded-lg flex items-center justify-center text-white">
              <img src="/epis_mais.png" alt="Epis de maïs" className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-800 dark:text-slate-100">Epibot</span>
          </div>
          <div className="flex items-center gap-4 relative">
            {view !== 'home' && (
              <button 
                onClick={() => setView('home')}
                className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1"
              >
                <ArrowLeft size={16} />
                Retour à l'accueil
              </button>
            )}
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              aria-label="Menu"
            >
              <Menu size={20} className="text-slate-700 dark:text-slate-200" />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 top-12 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-2 z-50">
                <button
                  onClick={() => setView('home')}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Accueil
                </button>
                <button
                  onClick={() => setView('account')}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Mon compte
                </button>
              </div>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={20} className="text-slate-700" /> : <Sun size={20} className="text-yellow-400" />}
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              aria-label="Se deconnecter"
              title="Se deconnecter"
            >
              <LogOut size={20} className="text-slate-700 dark:text-slate-300" />
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
                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 min-h-[600px] flex flex-col justify-center items-start text-left relative overflow-hidden transition-colors">
                  <div className="absolute -top-20 -right-20 w-60 h-60 bg-indigo-50 dark:bg-indigo-900/20 rounded-full blur-3xl opacity-50"></div>
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-50 dark:bg-blue-900/20 rounded-full blur-2xl opacity-50"></div>

                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-semibold mb-8">
                    <Sparkles size={16} />
                    Assistant Virtuel 2.0
                  </div>

                  <h1 className="text-6xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight mb-6">
                    Besoin d'aide ? <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500 dark:from-indigo-400 dark:to-blue-400">
                      Discutez avec Epibot.
                    </span>
                  </h1>
                  
                  <p className="text-slate-600 dark:text-slate-300 text-xl mb-12 leading-relaxed max-w-lg">
                    Je suis là pour répondre à vos questions sur la scolarité, l'administration ou la vie du campus. Disponible 24/7.
                  </p>

                  <button 
                    onClick={() => setView('chat')}
                    className="group relative w-full sm:w-auto flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-10 py-5 rounded-xl font-semibold text-lg transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50 hover:shadow-indigo-300 dark:hover:shadow-indigo-800/50 transform hover:-translate-y-0.5"
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
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl">
                    <HelpCircle size={24} />
                  </div>
                  <h2 className="text-4xl font-bold text-slate-800 dark:text-slate-100">Questions fréquentes</h2>
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
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <HelpCircle size={18} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">QCM Bases C</h3>
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
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

                <div className="mt-8 bg-slate-100 dark:bg-slate-800 rounded-xl p-6 flex items-start gap-4 border border-slate-200 dark:border-slate-700 transition-colors">
                  <div className="mt-1 text-slate-500 dark:text-slate-400">
                    <img src="/epis_mais.png" alt="Epibot" className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base mb-2">Le saviez-vous ?</h3>
                    <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                      Epibot apprend de chaque conversation. Plus vous posez de questions, plus il devient pertinent pour l'ensemble des étudiants.
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
            <aside className="w-72 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col">
              <button
                onClick={() => createNewConversation('Nouvelle conversation')}
                className="mb-4 flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                <Plus size={16} />
                Nouvelle conversation
              </button>
              <div className="flex-1 overflow-y-auto space-y-2">
                {conversations.length === 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Aucune conversation
                  </div>
                )}
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeConversationId === conv.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <button
                      onClick={() => setActiveConversationId(conv.id)}
                      className="flex-1 text-left truncate"
                      title={conv.title || 'Conversation'}
                    >
                      {conv.title || 'Conversation'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                      className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600"
                      title="Supprimer"
                      aria-label="Supprimer la conversation"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </aside>

            {/* Chat */}
            <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
              {/* Header du Chat */}
              <div className="bg-indigo-600 dark:bg-indigo-700 p-4 text-white flex items-center justify-between shadow-md z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <img src="/epis_mais.png" alt="Epibot" className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold">Epibot</h3>
                    <div className="flex items-center gap-1.5 opacity-90">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                      <span className="text-xs font-medium">En ligne</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setView('home')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Zone des messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 dark:bg-slate-900 transition-colors">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`
                      max-w-[80%] rounded-2xl p-4 shadow-sm
                      ${msg.sender === 'user' 
                        ? 'bg-indigo-600 dark:bg-indigo-700 text-white rounded-br-none' 
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-bl-none'}
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
                              className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800"
                            >
                              📎 {source}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className={`text-[10px] block mt-2 ${msg.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-1 transition-colors">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {lastBotMessageId && !isTyping && (
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
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
                        className="px-2 py-1 rounded-md border text-xs transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                      >
                        Oui
                      </button>
                      <button
                        onClick={() => handleFeedback('no')}
                        className="px-2 py-1 rounded-md border text-xs transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Non
                      </button>
                    </>
                  )}
                </div>
              )}
              {/* Zone de saisie */}
              <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 transition-colors">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Posez votre question à Epibot..."
                    className="flex-1 bg-slate-100 dark:bg-slate-700 border-transparent focus:bg-white dark:focus:bg-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 rounded-xl px-4 py-3 outline-none transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                  <button 
                    type="submit"
                    disabled={!inputValue.trim() || isTyping}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl p-3 transition-colors flex items-center justify-center aspect-square"
                  >
                    <Send size={20} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 transition-colors">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Mon compte</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-slate-600 dark:text-slate-200">
                          {(profile.name || profile.email || 'U').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Avatar</p>
                      <label className="text-sm font-medium text-indigo-600 dark:text-indigo-400 cursor-pointer">
                        Changer
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">URL de l'avatar</label>
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => handleAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1 w-full bg-slate-100 dark:bg-slate-700 border border-transparent focus:border-indigo-500 dark:focus:border-indigo-400 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">Nom</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                      className="mt-1 w-full bg-slate-100 dark:bg-slate-700 border border-transparent focus:border-indigo-500 dark:focus:border-indigo-400 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-500 dark:text-slate-400">Email</label>
                    <input
                      type="email"
                      value={profile.email}
                      readOnly
                      className="mt-1 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
                    />
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Temps de connexion : <span className="font-semibold">{formatDuration(sessionSeconds)}</span>
                  </div>
                  <button
                    type="button"
                    className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Composant Carte FAQ (Questions fréquentes)
const GeneralFAQCard = ({ faq, onAsk }: { faq: GeneralFAQItem; onAsk: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer group min-h-[140px] flex flex-col" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex justify-between items-start gap-3 flex-1">
        <div className="flex-1">
          <span className="inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 mb-3">
            {faq.category}
          </span>
          <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
            {faq.question}
          </h3>
        </div>
        <div className={`text-slate-400 dark:text-slate-500 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>
          <ChevronRight size={20} />
        </div>
      </div>

      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="text-base text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-700 leading-relaxed">
            {faq.answer}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAsk();
            }}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mt-3 hover:underline flex items-center gap-2"
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
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer group min-h-[140px] flex flex-col" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex justify-between items-start gap-3 flex-1">
        <div className="flex-1">
          <span className="inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 mb-3">
            {faq.category}
          </span>
          <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
            {faq.question}
          </h3>
        </div>
        <div className={`text-slate-400 dark:text-slate-500 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>
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
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                        : 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300')
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          {selectedIndex !== null && (
            <p className={`mt-3 text-sm px-3 py-2 rounded-lg border ${
              isCorrect
                ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
            }`}>
              {isCorrect ? 'Bonne réponse.' : 'Pas tout à fait.'} {faq.answer}
            </p>
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onAsk();
            }}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mt-3 hover:underline flex items-center gap-2"
          >
            <MessageCircle size={14} />
            Poser cette question dans le chat
          </button>
        </div>
      </div>
    </div>
  );
};
