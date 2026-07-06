import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, HelpCircle, Send, ArrowLeft, ChevronRight, Sparkles, X, Sun, Moon, LogOut, Menu, Plus, Trash2, Users, Share2, Paperclip, FileText } from 'lucide-react';
import { createMessage, updateMessage, updateMessageFeedback } from '../services/messagesService';
import { useTheme } from '../hooks/useTheme';
import { sendMessageStream, extractFileText } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { createConversation, deleteConversation, getMessagesByConversation, getUserConversations, getConversationMembers } from '../services/conversationsService';
import { acceptInvite } from '../services/invitesService';
import { generateExtensionToken } from '../services/extensionService';
import { getUserById } from '../services/usersService';
import { useConversationRealtime } from '../hooks/useConversationRealtime';
import { ShareConversationModal } from './ShareConversationModal';
import { Logo } from './Logo';
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
  const [userPromo, setUserPromo] = useState<number | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [sessionStart, setSessionStart] = useState(Date.now());
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeMembers, setActiveMembers] = useState<ConversationMember[]>([]);
  const [extToken, setExtToken] = useState<string | null>(null);
  const [extTokenLoading, setExtTokenLoading] = useState(false);
  const [extTokenCopied, setExtTokenCopied] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; text: string; readable: boolean } | null>(null);
  const [attachLoading, setAttachLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      // Récupère la promo (année de sortie) depuis le profil — sert au filtrage
      // des documents accessibles selon l'année d'étude de l'étudiant.
      if (user.id) {
        getUserById(user.id)
          .then((u) => setUserPromo(u?.promo ?? null))
          .catch(() => setUserPromo(null));
      }
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

  // Sélection d'un fichier à joindre : on en extrait le texte via le backend.
  const handleAttachFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setAttachLoading(true);
    try {
      const extracted = await extractFileText(file);
      setAttachment({ name: extracted.filename, text: extracted.content, readable: extracted.readable });
    } catch (e) {
      console.error('Erreur extraction fichier:', e);
      alert(e instanceof Error ? e.message : "Impossible de lire ce fichier.");
    } finally {
      setAttachLoading(false);
    }
  };

  const handleSendMessage = async (text: string = inputValue) => {
    // Un fichier joint suffit à envoyer, même sans texte.
    const sentAttachment = attachment;
    if (!text.trim() && !sentAttachment) return;

    // Texte affiché/sauvegardé : la question + une mention du fichier (pas tout le contenu).
    const displayText = sentAttachment
      ? `${text}${text.trim() ? '\n\n' : ''}📎 ${sentAttachment.name}`
      : text;

    // Texte envoyé à l'IA : question + contenu extrait du fichier (si lisible).
    const aiText = sentAttachment && sentAttachment.readable
      ? `${text}\n\n[Fichier joint : ${sentAttachment.name}]\n\`\`\`\n${sentAttachment.text}\n\`\`\``
      : sentAttachment
        ? `${text}\n\n[L'étudiant a joint le fichier « ${sentAttachment.name} » mais son contenu n'est pas lisible (image ou binaire).]`
        : text;

    const localUserMsgId = Date.now();
    const newUserMsg: Message = {
      id: localUserMsgId,
      text: displayText,
      sender: 'user',
      timestamp: new Date(),
      isMine: true,
      authorName: profile.name || undefined,
      authorAvatar: avatarPreview || undefined,
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    setAttachment(null);
    setIsTyping(true);

    const currentUserId = user?.id || null;
    let savedUserMessageId: number | null = null;
    // Sauvegarder le message utilisateur dans Supabase (optionnel, ne bloque pas le chat)
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = await createNewConversation((displayText || 'Fichier').slice(0, 48));
      }
      const savedUser = await createMessage({
        content: displayText,
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
      // On envoie aiText (question + contenu du fichier joint) à l'IA.
      const outgoing = isShared ? `${myName} : ${aiText}` : aiText;

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
      }, userPromo);

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

  const handleGenerateExtToken = async () => {
    setExtTokenLoading(true);
    setExtTokenCopied(false);
    try {
      const token = await generateExtensionToken('VS Code');
      setExtToken(token);
    } catch (error) {
      console.error('Erreur génération token extension:', error);
      alert(error instanceof Error ? error.message : 'Impossible de générer le token.');
    } finally {
      setExtTokenLoading(false);
    }
  };

  const handleCopyExtToken = async () => {
    if (!extToken) return;
    await navigator.clipboard.writeText(extToken);
    setExtTokenCopied(true);
    setTimeout(() => setExtTokenCopied(false), 2000);
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
      {/* Header Global — topbar façon IDE, aplat bleu de marque */}
      <header className="bg-accent border-b border-accent-ink sticky top-0 z-50 transition-colors">
        <div className="h-11 flex items-stretch justify-between text-white">
          {/* Marque */}
          <button
            onClick={() => setView('home')}
            className="flex items-center px-3.5 border-r border-white/15 hover:bg-white/10 transition-colors"
          >
            <Logo size={18} tone="light" />
          </button>

          {/* Navigation */}
          <nav className="flex items-stretch">
            <button
              onClick={() => setView('home')}
              className={`px-3.5 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider border-r border-white/15 transition-colors ${
                view === 'home' ? 'text-white bg-white/15' : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              Accueil
            </button>
            <button
              onClick={() => setView('chat')}
              className={`px-3.5 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider border-r border-white/15 transition-colors ${
                view === 'chat' ? 'text-white bg-white/15' : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setView('account')}
              className={`px-3.5 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider border-r border-white/15 transition-colors ${
                view === 'account' ? 'text-white bg-white/15' : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              Compte
            </button>
          </nav>

          {/* Spacer + méta + actions */}
          <div className="flex-1 flex items-stretch justify-end">
            {view !== 'home' && (
              <button
                onClick={() => setView('home')}
                className="hidden sm:flex items-center gap-1.5 px-3 text-[11px] font-mono uppercase tracking-wider text-white/60 hover:text-white border-l border-white/15 transition-colors"
              >
                <ArrowLeft size={13} />
                Accueil
              </button>
            )}
            <div className="hidden md:flex items-center px-3.5 border-l border-white/15">
              <span className="font-mono text-[11px] text-white/70 tracking-tight truncate max-w-[280px]">
                {(profile.name || profile.email || 'USER').toUpperCase()}
                <span className="text-white/40 mx-1.5">·</span>
                EPIBOT
              </span>
            </div>
            <div className="flex items-stretch border-l border-white/15 relative">
              <button
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="px-3 flex items-center hover:bg-white/10 transition-colors"
                aria-label="Menu"
              >
                <Menu size={16} className="text-white/80" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-11 w-44 bg-surface border border-hairline-strong shadow-lg z-50">
                  <button
                    onClick={() => setView('home')}
                    className="w-full text-left px-3.5 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-2 hover:bg-surface-2 border-b border-hairline transition-colors"
                  >
                    Accueil
                  </button>
                  <button
                    onClick={() => setView('account')}
                    className="w-full text-left px-3.5 py-2 text-[11px] font-mono uppercase tracking-wider text-ink-2 hover:bg-surface-2 transition-colors"
                  >
                    Mon compte
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={toggleTheme}
              className="px-3 flex items-center border-l border-white/15 hover:bg-white/10 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={16} className="text-white/80" /> : <Sun size={16} className="text-white" />}
            </button>
            <button
              onClick={signOut}
              className="px-3 flex items-center border-l border-white/15 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Se deconnecter"
              title="Se deconnecter"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Contenu Principal */}
      <main className="mx-auto max-w-[1600px]">
        {view === 'home' ? (
          <div>
            {/* Bloc d'accroche sobre */}
            <section className="border-b border-hairline bg-surface">
              <div className="px-5 py-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={13} className="text-accent" />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                      Assistant pédagogique · collaboratif
                    </span>
                  </div>
                  <h1 className="font-display text-3xl font-semibold text-ink leading-tight mb-2">
                    Besoin d'aide ? Discutez avec Epibot.
                  </h1>
                  <p className="text-ink-2 text-sm leading-relaxed max-w-xl">
                    Posez vos questions sur les projets et les cours — seul ou à plusieurs. Epibot vous guide sans jamais faire le travail à votre place.
                  </p>
                </div>
                <button
                  onClick={() => setView('chat')}
                  className="group flex items-center justify-center gap-2 bg-accent hover:bg-accent-ink on-accent px-5 py-2.5 rounded-[2px] font-medium text-sm transition-colors flex-shrink-0"
                >
                  <MessageCircle size={16} />
                  Commencer une discussion
                  <ChevronRight size={15} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            </section>

            {/* Grille FAQ / QCM en colonnes bordées */}
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Colonne FAQ générales */}
              <section className="border-b lg:border-r border-hairline">
                <div className="flex items-center gap-2 px-5 py-2.5 border-b border-hairline bg-surface">
                  <HelpCircle size={13} className="text-ink-3" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                    Questions fréquentes
                  </span>
                  <span className="ml-auto font-num text-[11px] text-ink-3">{GENERAL_FAQS.length}</span>
                </div>
                <div className="divide-y divide-hairline">
                  {GENERAL_FAQS.map((faq) => (
                    <GeneralFAQCard
                      key={faq.id}
                      faq={faq}
                      onAsk={() => startChatWithQuestion(faq.question)}
                    />
                  ))}
                </div>
              </section>

              {/* Colonne QCM */}
              <section className="border-b border-hairline">
                <div className="flex items-center gap-2 px-5 py-2.5 border-b border-hairline bg-surface">
                  <HelpCircle size={13} className="text-ink-3" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                    QCM Bases C
                  </span>
                  <span className="ml-auto font-num text-[11px] text-ink-3">{INITIAL_FAQS.length}</span>
                </div>
                <div className="divide-y divide-hairline">
                  {INITIAL_FAQS.map((faq) => (
                    <FAQCard
                      key={faq.id}
                      faq={faq}
                      onAsk={() => startChatWithQuestion(faq.question)}
                    />
                  ))}
                </div>
              </section>
            </div>

            {/* Bandeau info */}
            <div className="border-b border-hairline bg-surface-2 px-5 py-3 flex items-start gap-3">
              <img src="/epis_mais.png" alt="Epibot" className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Le saviez-vous ?</span>
                <p className="text-sm text-ink-2 leading-relaxed mt-0.5">
                  Vous pouvez désormais <b className="text-ink">partager une conversation</b> : invitez d'autres étudiants et interrogez Epibot ensemble, en temps réel.
                </p>
              </div>
            </div>
          </div>
        ) : view === 'chat' ? (
          /* Vue Chat — station de travail dense */
          <div className="h-[calc(100vh-2.75rem)] flex border-b border-hairline">
            {/* Colonne gauche : liste des conversations */}
            <aside className="w-64 flex-shrink-0 bg-surface border-r border-hairline flex flex-col">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hairline">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                  Conversations
                </span>
                <button
                  onClick={() => createNewConversation('Nouvelle conversation')}
                  className="p-1 -mr-1 text-ink-2 hover:text-accent hover:bg-surface-2 rounded-[2px] transition-colors"
                  title="Nouvelle conversation"
                  aria-label="Nouvelle conversation"
                >
                  <Plus size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 && (
                  <div className="px-3.5 py-3 font-mono text-[11px] text-ink-3">
                    Aucune conversation
                  </div>
                )}
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-stretch border-b border-hairline transition-colors ${
                      activeConversationId === conv.id
                        ? 'bg-surface-2'
                        : 'hover:bg-surface-2'
                    }`}
                  >
                    {/* Liseré actif */}
                    <span
                      className={`w-[2px] flex-shrink-0 ${
                        activeConversationId === conv.id ? 'bg-accent' : 'bg-transparent'
                      }`}
                    />
                    <button
                      onClick={() => setActiveConversationId(conv.id)}
                      className="flex-1 min-w-0 text-left px-3 py-2.5"
                      title={conv.title || 'Conversation'}
                    >
                      <div className="flex items-center gap-1.5">
                        {conv.is_owner === false && (
                          <Users size={12} className="flex-shrink-0 text-positive" />
                        )}
                        <span className={`truncate text-[13px] ${
                          activeConversationId === conv.id ? 'text-ink font-medium' : 'text-ink-2'
                        }`}>
                          {conv.title || 'Conversation'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 font-mono text-[10px] text-ink-3">
                        {conv.is_owner === false ? (
                          <span className="text-positive uppercase tracking-wide">Partagé</span>
                        ) : (
                          <span className="uppercase tracking-wide">Fil</span>
                        )}
                        {conv.created_at && (
                          <>
                            <span className="text-hairline-strong">·</span>
                            <span className="font-num">
                              {new Date(conv.created_at).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </span>
                          </>
                        )}
                      </div>
                    </button>
                    {conv.is_owner !== false && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                        className="px-2 flex items-center text-ink-3 hover:text-critical hover:bg-critical-soft opacity-0 group-hover:opacity-100 transition-all"
                        title="Supprimer"
                        aria-label="Supprimer la conversation"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            {/* Centre : le LOG de messages */}
            <div className="flex-1 min-w-0 flex flex-col bg-ground">
              {/* Barre d'en-tête du log */}
              <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-hairline flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 bg-accent flex items-center justify-center flex-shrink-0">
                    <img src="/epis_mais.png" alt="Epibot" className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-semibold text-[13px] text-ink leading-none">EPIBOT</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 bg-positive rounded-full animate-pulse"></span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                        {activeMembers.length > 1
                          ? `En ligne · ${activeMembers.length} participants`
                          : 'En ligne'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeConversationId && (
                    <button
                      onClick={() => setShareOpen(true)}
                      className="px-2.5 py-1.5 border border-hairline-strong hover:bg-surface-2 rounded-[2px] transition-colors flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-2"
                      title="Partager la conversation"
                    >
                      <Share2 size={13} />
                      <span className="hidden sm:inline">Partager</span>
                    </button>
                  )}
                  <button
                    onClick={() => setView('home')}
                    className="p-1.5 hover:bg-surface-2 rounded-[2px] transition-colors text-ink-3 hover:text-ink"
                    aria-label="Fermer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Zone des messages (log) */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.map((msg) => {
                  // Mon message = à droite. Message d'un autre membre ou du bot = à gauche.
                  const isMine = msg.sender === 'user' && msg.isMine;
                  const isOther = msg.sender === 'user' && !msg.isMine;
                  const isBot = msg.sender === 'bot';
                  const authorLabel = isBot ? 'EPIBOT' : isMine ? 'VOUS' : (msg.authorName || 'ÉTUDIANT').toUpperCase();
                  return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="max-w-[78%] min-w-0">
                      {/* Ligne label auteur + timestamp */}
                      <div className={`flex items-center gap-2 mb-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <span className={`font-mono text-[10px] uppercase tracking-wider ${
                          isBot ? 'text-accent' : isOther ? 'text-positive' : 'text-ink-3'
                        }`}>
                          {authorLabel}
                        </span>
                        <span className="font-num text-[10px] text-ink-3">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className={`
                        rounded-[2px] px-3.5 py-2.5 border
                        ${isMine
                          ? 'bg-accent-soft border-accent-soft'
                          : isOther
                          ? 'bg-surface border-l-2 border-l-positive border-hairline'
                          : 'bg-surface border-l-2 border-l-accent border-hairline'}
                      `}>
                        <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none text-ink">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                        {msg.sender === 'bot' && msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-hairline flex flex-wrap gap-1.5">
                            {msg.sources.map((source) => (
                              <span
                                key={source}
                                className="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-surface-2 text-ink-2 border border-hairline"
                              >
                                {source}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-surface border border-hairline border-l-2 border-l-accent rounded-[2px] px-3.5 py-3 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-ink-3 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-ink-3 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-ink-3 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Barre de feedback */}
              {lastBotMessageId && !isTyping && (
                <div className="px-4 py-2 bg-surface border-t border-hairline flex items-center gap-2 flex-shrink-0">
                  {lastFeedback ? (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                      {lastFeedback === 'yes'
                        ? 'Merci pour votre retour.'
                        : 'Merci, votre retour nous aide à nous améliorer.'}
                    </span>
                  ) : (
                    <>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                        Réponse utile ?
                      </span>
                      <button
                        onClick={() => handleFeedback('yes')}
                        className="px-2.5 py-1 rounded-[2px] border font-mono text-[10px] uppercase tracking-wider transition-colors bg-surface border-hairline text-ink-2 hover:bg-positive-soft hover:text-positive hover:border-positive/40"
                      >
                        Oui
                      </button>
                      <button
                        onClick={() => handleFeedback('no')}
                        className="px-2.5 py-1 rounded-[2px] border font-mono text-[10px] uppercase tracking-wider transition-colors bg-surface border-hairline text-ink-2 hover:bg-critical-soft hover:text-critical hover:border-critical/40"
                      >
                        Non
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Zone de saisie */}
              <div className="px-3 py-3 bg-surface border-t border-hairline flex-shrink-0">
                {/* Prévisualisation du fichier joint */}
                {(attachment || attachLoading) && (
                  <div className="mb-2 flex items-center gap-2 bg-surface-2 border border-hairline rounded-[2px] px-2.5 py-1.5 text-[12px]">
                    <FileText size={14} className="text-accent shrink-0" />
                    {attachLoading ? (
                      <span className="text-ink-3 font-mono">Lecture du fichier…</span>
                    ) : (
                      <>
                        <span className="text-ink truncate flex-1 font-mono">{attachment!.name}</span>
                        {!attachment!.readable && (
                          <span className="text-watch text-[10px] uppercase tracking-wider font-mono shrink-0">
                            non lisible par l'IA
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setAttachment(null)}
                          className="text-ink-3 hover:text-critical shrink-0"
                          title="Retirer"
                        >
                          <X size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                  className="flex gap-2"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleAttachFile}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={attachLoading}
                    title="Joindre un fichier"
                    className="bg-surface-2 border border-hairline hover:border-accent text-ink-2 hover:text-accent disabled:opacity-40 rounded-[2px] px-2.5 transition-colors flex items-center justify-center"
                  >
                    <Paperclip size={16} />
                  </button>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Posez votre question à Epibot..."
                    className="flex-1 bg-surface-2 border border-hairline focus:border-accent rounded-[2px] px-3 py-2.5 text-sm outline-none transition-colors text-ink placeholder:text-ink-3"
                  />
                  <button
                    type="submit"
                    disabled={(!inputValue.trim() && !attachment) || isTyping}
                    className="bg-accent hover:bg-accent-ink disabled:opacity-40 disabled:cursor-not-allowed on-accent rounded-[2px] px-3 transition-colors flex items-center justify-center"
                  >
                    <Send size={17} />
                  </button>
                </form>
              </div>

              {/* Barre d'état inférieure */}
              <div className="flex items-center gap-3 px-4 py-1.5 bg-surface-2 border-t border-hairline font-mono text-[10px] uppercase tracking-wider text-ink-3 flex-shrink-0">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-positive rounded-full"></span>
                  Connecté
                </span>
                <span className="text-hairline-strong">·</span>
                <span>{messages.length} msg</span>
                {activeMembers.length > 1 && (
                  <>
                    <span className="text-hairline-strong">·</span>
                    <span>{activeMembers.length} membres</span>
                  </>
                )}
                <span className="ml-auto truncate max-w-[220px]">
                  {activeConversationId ? `ID ${activeConversationId.slice(0, 8)}` : 'Nouveau fil'}
                </span>
              </div>
            </div>

            {/* Colonne droite : panneau contexte */}
            <aside className="hidden xl:flex w-72 flex-shrink-0 bg-surface border-l border-hairline flex-col overflow-y-auto">
              {/* Participants */}
              <div className="border-b border-hairline">
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-hairline">
                  <Users size={12} className="text-ink-3" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Participants</span>
                  <span className="ml-auto font-num text-[11px] text-ink-3">{activeMembers.length}</span>
                </div>
                <div>
                  {activeMembers.length === 0 && (
                    <div className="px-3.5 py-2.5 font-mono text-[11px] text-ink-3">Vous seul</div>
                  )}
                  {activeMembers.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-2.5 px-3.5 py-2 border-b border-hairline last:border-b-0">
                      <div
                        className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold on-accent flex-shrink-0"
                        style={{ background: m.user_id === user?.id ? 'var(--color-accent)' : 'var(--color-positive)' }}
                        title={m.user?.name || 'Étudiant'}
                      >
                        {m.user?.avatar_url ? (
                          <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (m.user?.name || '?').slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <span className="text-[13px] text-ink-2 truncate flex-1">
                        {m.user?.name || 'Étudiant'}
                        {m.user_id === user?.id && <span className="text-ink-3"> (vous)</span>}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-ink-3 flex-shrink-0">
                        {m.role === 'owner' ? 'Owner' : 'Membre'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sources RAG du dernier message bot */}
              {(() => {
                const lastBot = [...messages].reverse().find((m) => m.sender === 'bot' && m.sources && m.sources.length > 0);
                return (
                  <div className="border-b border-hairline">
                    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-hairline">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Sources RAG</span>
                      <span className="ml-auto font-num text-[11px] text-ink-3">{lastBot?.sources?.length ?? 0}</span>
                    </div>
                    <div>
                      {lastBot?.sources && lastBot.sources.length > 0 ? (
                        lastBot.sources.map((source) => (
                          <div key={source} className="px-3.5 py-2 border-b border-hairline last:border-b-0 font-mono text-[11px] text-ink-2 truncate" title={source}>
                            {source}
                          </div>
                        ))
                      ) : (
                        <div className="px-3.5 py-2.5 font-mono text-[11px] text-ink-3">Aucune source</div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </aside>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto border-x border-hairline min-h-[calc(100vh-2.75rem)]">
            {/* En-tête section compte */}
            <div className="flex items-center gap-2 px-5 py-2.5 border-b border-hairline bg-surface">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Mon compte</span>
              <span className="ml-auto font-num text-[11px] text-ink-3 truncate max-w-[240px]">{profile.email}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Panneau : Identité / avatar */}
              <div className="border-b md:border-r border-hairline">
                <div className="px-5 py-2 border-b border-hairline bg-surface-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Identité</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-[2px] bg-surface-2 border border-hairline overflow-hidden flex items-center justify-center flex-shrink-0">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl font-bold text-ink-2 font-display">
                          {(profile.name || profile.email || 'U').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-ink-3 mb-1">Avatar</p>
                      <label className="inline-flex items-center px-2.5 py-1 border border-hairline-strong rounded-[2px] font-mono text-[10px] uppercase tracking-wider text-ink-2 hover:bg-surface-2 cursor-pointer transition-colors">
                        Changer
                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-wider text-ink-3">URL de l'avatar</label>
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => handleAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1.5 w-full bg-surface-2 border border-hairline focus:border-accent rounded-[2px] px-3 py-2 text-sm text-ink placeholder:text-ink-3 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Panneau : Profil */}
              <div className="border-b border-hairline">
                <div className="px-5 py-2 border-b border-hairline bg-surface-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Profil</span>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Nom</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                      className="mt-1.5 w-full bg-surface-2 border border-hairline focus:border-accent rounded-[2px] px-3 py-2 text-sm text-ink outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Email</label>
                    <input
                      type="email"
                      value={profile.email}
                      readOnly
                      className="mt-1.5 w-full bg-surface-2 border border-hairline rounded-[2px] px-3 py-2 text-sm text-ink-3 cursor-not-allowed font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 py-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Temps de session</span>
                    <span className="ml-auto font-num text-sm text-ink tnum">{formatDuration(sessionSeconds)}</span>
                  </div>
                  <button
                    type="button"
                    className="px-4 py-2 bg-accent hover:bg-accent-ink on-accent text-sm font-medium rounded-[2px] transition-colors"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>

            {/* Panneau : Extension VS Code */}
            <div className="border-b border-hairline">
              <div className="px-5 py-2 border-b border-hairline bg-surface-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">Extension VS Code</span>
              </div>
              <div className="p-5">
                <p className="text-sm text-ink-2 mb-3 leading-relaxed max-w-2xl">
                  Générez un token pour connecter l'extension VS Code à votre compte.
                  Elle signale les collages massifs de code à l'équipe pédagogique.
                </p>
                {extToken ? (
                  <div className="flex gap-2 max-w-2xl">
                    <input
                      readOnly
                      value={extToken}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 bg-surface-2 border border-hairline rounded-[2px] px-3 py-2 text-xs font-mono text-ink-2 truncate"
                    />
                    <button
                      type="button"
                      onClick={handleCopyExtToken}
                      className="px-3 py-2 rounded-[2px] bg-accent hover:bg-accent-ink on-accent text-xs font-medium whitespace-nowrap transition-colors"
                    >
                      {extTokenCopied ? 'Copié ✓' : 'Copier'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateExtToken}
                    disabled={extTokenLoading}
                    className="px-4 py-2 bg-surface-2 hover:bg-hairline border border-hairline-strong text-ink text-sm font-medium rounded-[2px] transition-colors disabled:opacity-50"
                  >
                    {extTokenLoading ? 'Génération…' : 'Générer un token VS Code'}
                  </button>
                )}
                {extToken && (
                  <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 bg-watch-soft border border-watch/40 rounded-[2px] max-w-2xl">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-watch">
                      Copiez-le maintenant : collez-le dans les réglages de l'extension.
                    </span>
                  </div>
                )}
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
    <div className="group transition-colors hover:bg-surface-2 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex items-start gap-3 px-5 py-3">
        <div className={`text-ink-3 mt-0.5 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-90 text-accent' : ''}`}>
          <ChevronRight size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            {faq.category}
          </span>
          <h3 className="text-sm font-medium text-ink group-hover:text-accent transition-colors leading-snug mt-0.5">
            {faq.question}
          </h3>
        </div>
      </div>

      <div className={`grid transition-all duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-3 pl-[2.75rem]">
            <p className="text-sm text-ink-2 bg-surface-2 px-3 py-2.5 rounded-[2px] border-l-2 border-accent border-y border-r border-hairline leading-relaxed">
              {faq.answer}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAsk();
              }}
              className="font-mono text-[10px] uppercase tracking-wider text-accent mt-2.5 hover:underline flex items-center gap-1.5"
            >
              <MessageCircle size={13} />
              Poser dans le chat
            </button>
          </div>
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
    <div className="group transition-colors hover:bg-surface-2 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex items-start gap-3 px-5 py-3">
        <div className={`text-ink-3 mt-0.5 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-90 text-accent' : ''}`}>
          <ChevronRight size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            {faq.category}
          </span>
          <h3 className="text-sm font-medium text-ink group-hover:text-accent transition-colors leading-snug mt-0.5">
            {faq.question}
          </h3>
        </div>
      </div>

      <div className={`grid transition-all duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-3 pl-[2.75rem]">
            <div className="space-y-1.5">
              {faq.options.map((option, idx) => (
                <button
                  key={option}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIndex(idx);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-[2px] border text-sm transition-colors ${
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
              <p className={`mt-2.5 text-sm px-3 py-2 rounded-[2px] border-l-2 border-y border-r ${
                isCorrect
                  ? 'border-l-positive border-positive/40 bg-positive-soft text-positive'
                  : 'border-l-watch border-watch/40 bg-watch-soft text-watch'
              }`}>
                {isCorrect ? 'Bonne réponse.' : 'Pas tout à fait.'} {faq.answer}
              </p>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAsk();
              }}
              className="font-mono text-[10px] uppercase tracking-wider text-accent mt-2.5 hover:underline flex items-center gap-1.5"
            >
              <MessageCircle size={13} />
              Poser dans le chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
