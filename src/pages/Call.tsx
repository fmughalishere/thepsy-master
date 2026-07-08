import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHMSActions, useHMSStore, selectPeers, selectLocalPeer, selectIsConnectedToRoom, selectVideoTrackByPeerID, selectAudioTrackByPeerID, HMSRoomProvider, selectPeerAudioByID } from '@100mslive/react-sdk';
import { onSnapshot } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, PhoneOff, StickyNote, Check, Loader2, History, MoreVertical, Edit2, Trash2, X } from 'lucide-react';
import { functions, db, auth } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc, updateDoc, Timestamp, addDoc, collection, query, where, orderBy, getDocs, deleteDoc } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { updateSessionTiming, updateAppointmentPayment } from "@/services/payrollService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

const AudioVisualizer = ({ peerId }: { peerId: string }) => {
    const audioLevel = useHMSStore(selectPeerAudioByID(peerId)) || 0;
    // Add a threshold to prevent blinking on silence/background noise
    const activeLevel = audioLevel > 5 ? audioLevel : 0;
    const scale = 1 + (activeLevel / 200);
    
    return (
        <div className="flex items-center space-x-1 h-4">
            {[1, 2, 3, 4].map((i) => (
                <div
                    key={i}
                    className="w-0.5 bg-green-500 rounded-full transition-all duration-75"
                    style={{
                        height: activeLevel > (i * 10) ? `${Math.max(4, (activeLevel / 10) * (i * 0.5))}px` : '4px',
                        opacity: 0.4 + (activeLevel / 150)
                    }}
                />
            ))}
        </div>
    );
};

const VideoTile = ({ peer, isLocal = false, isAudioOnly = false }: { peer: any, isLocal?: boolean, isAudioOnly?: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hmsActions = useHMSActions();
    const videoTrack = useHMSStore(selectVideoTrackByPeerID(peer.id));
    const { t } = useTranslation();

    useEffect(() => {
        if (videoRef.current && videoTrack && !isAudioOnly) {
            if (videoTrack.enabled) {
                hmsActions.attachVideo(videoTrack.id, videoRef.current);
            } else {
                hmsActions.detachVideo(videoTrack.id, videoRef.current);
            }
        }
    }, [videoTrack, hmsActions, isAudioOnly]);

    return (
        <div className={`relative h-full w-full rounded-[2rem] overflow-hidden shadow-2xl border border-white/5 group transition-all duration-500 ${isAudioOnly ? 'bg-neutral-900/50 backdrop-blur-xl' : 'bg-neutral-900'}`}>
            {!isAudioOnly ? (
                <>
                    <video
                        ref={videoRef}
                        autoPlay
                        muted={isLocal}
                        playsInline
                        className={`object-cover w-full h-full ${isLocal ? 'scale-x-[-1]' : ''} transition-transform duration-700`}
                    />
                    {!videoTrack?.enabled && (
                        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800/95 backdrop-blur-md">
                            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                <span className="text-3xl font-bold text-white/20 uppercase tracking-tighter">
                                    {peer.name?.charAt(0)}
                                </span>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                        {/* Pulse effect for audio activity */}
                        <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping scale-150 opacity-20" />
                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-950 flex items-center justify-center border border-white/10 shadow-inner">
                            <span className="text-4xl font-bold text-white/80">
                                {peer.name?.charAt(0)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* User Info & Visualizer */}
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between bg-black/40 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 shadow-lg">
                <div className="flex items-center space-x-3">
                    <div className="flex flex-col">
                        <span className="text-white text-sm font-semibold truncate max-w-[120px]">
                            {peer.name?.replace(/^Dr\.?\s+/i, '')} {isLocal && `(${t('common.you', 'You')})`}
                        </span>
                    </div>
                </div>
                <AudioVisualizer peerId={peer.id} />
            </div>
        </div>
    );
};

const Room = ({ deviceInfo }: { deviceInfo: { hasCamera: boolean, hasMic: boolean } }) => {
    const peers = useHMSStore(selectPeers);
    const localPeer = useHMSStore(selectLocalPeer);
    const isConnected = useHMSStore(selectIsConnectedToRoom);
    const hmsActions = useHMSActions();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { appointmentId } = useParams();

    const [isMicOn, setIsMicOn] = useState(deviceInfo.hasMic);
    const [isVideoOn, setIsVideoOn] = useState(deviceInfo.hasCamera);
    const [patientJoinTime, setPatientJoinTime] = useState<Timestamp | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [showExitDialog, setShowExitDialog] = useState(false);
    const [isTherapist, setIsTherapist] = useState(false);
    const [accumulatedDuration, setAccumulatedDuration] = useState(0);
    const [lastActiveTimestamp, setLastActiveTimestamp] = useState<Timestamp | null>(null);
    const [patientId, setPatientId] = useState<string | null>(null);
    const [therapistId, setTherapistId] = useState<string | null>(null);
    const [hasSentJoinNotif, setHasSentJoinNotif] = useState(false);
    const [appointmentType, setAppointmentType] = useState<string>('video');
    const [activePeerId, setActivePeerId] = useState<string | null>(null);

    // Therapist Notes State
    const [isNotesOpen, setIsNotesOpen] = useState(false);
    const [isNotesExpanded, setIsNotesExpanded] = useState(true);
    const [sessionNote, setSessionNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [pastNotes, setPastNotes] = useState<any[]>([]);
    const [isLoadingPastNotes, setIsLoadingPastNotes] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [activeNoteTab, setActiveNoteTab] = useState('new');

    // Persistent Notification for Mobile Web
    useEffect(() => {
        if (!isConnected) return;

        const showOngoingNotification = async () => {
            if ('serviceWorker' in navigator && 'Notification' in window) {
                const registration = await navigator.serviceWorker.ready;
                if (Notification.permission === 'default') {
                    await Notification.requestPermission();
                }

                if (Notification.permission === 'granted') {
                    registration.showNotification(t('consultation.call_in_progress', 'Call in Progress'), {
                        body: t('consultation.tap_to_return', 'Tap to return to your session'),
                        icon: '/app-logo.png',
                        badge: '/favicon.webp',
                        tag: 'ongoing-call',
                        renotify: false,
                        silent: true,
                        requireInteraction: true, // Make it persistent on supported browsers
                        data: { type: 'consultation_message', appointmentId }
                    } as any);
                }
            }

            // Media Session API for Lock Screen/Notification Control
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: t('consultation.call_in_progress', 'Call in Progress'),
                    artist: 'ThePsy',
                    album: appointmentType === 'call' ? t('common.audio_call', 'Audio Call') : t('common.video_call', 'Video Call'),
                    artwork: [{ src: '/app-logo.png', sizes: '512x512', type: 'image/png' }]
                });

                navigator.mediaSession.playbackState = 'playing';
                navigator.mediaSession.setActionHandler('play', () => { window.focus(); });
            }
        };

        showOngoingNotification();

        return () => {
            // Cleanup notification on unmount
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.getNotifications({ tag: 'ongoing-call' }).then(notifications => {
                        notifications.forEach(n => n.close());
                    });
                });
            }
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'none';
            }
        };
    }, [isConnected, appointmentId, appointmentType, t]);

    const remotePeers = peers.filter(p => !p.isLocal);
    const isBothConnected = isConnected && remotePeers.length > 0;

    // Default active peer is the first remote peer
    useEffect(() => {
        if (!activePeerId && remotePeers.length > 0) {
            setActivePeerId(remotePeers[0].id);
        } else if (remotePeers.length === 0) {
            setActivePeerId(null);
        }
    }, [remotePeers, activePeerId]);

    const handleSwap = (peerId: string) => {
        if (appointmentType === 'video') {
            setActivePeerId(peerId);
        }
    };

    useEffect(() => {
        const init = async () => {
            if (!appointmentId || !auth.currentUser) return;
            const appRef = doc(db, 'appointments', appointmentId);
            const snap = await getDoc(appRef);
            if (snap.exists()) {
                const data = snap.data();
                const isT = data.therapistId === auth.currentUser.uid;
                setIsTherapist(isT);
                setPatientId(data.patientId || data.bookedBy);
                setTherapistId(data.therapistId);
                setAccumulatedDuration(data.accumulatedDurationSeconds || 0);
                setLastActiveTimestamp(data.lastActiveTimestamp);
                const apptType = data.appointmentType || 'video';
                setAppointmentType(apptType);
                // For audio-only calls, disable video publication immediately
                if (apptType === 'call') {
                    try {
                        await hmsActions.setLocalVideoEnabled(false);
                    } catch (e) {
                        console.warn('Failed to disable local video for audio call', e);
                    }
                    setIsVideoOn(false);
                }

                if (data.status === 'COMPLETED') {
                    toast({
                        title: t('consultation.status_completed', 'Session Completed'),
                        description: t('consultation.status_completed_desc', 'This session has already been completed.'),
                    });
                } else if (data.status !== 'IN_PROGRESS' && isT) {
                    // Only therapist marks it as IN_PROGRESS
                    await updateDoc(appRef, {
                        status: 'IN_PROGRESS',
                        sessionStartTime: Timestamp.now(),
                    });
                }
            }
        };
        init();
    }, [appointmentId, t, hmsActions]);

    // Send Join Notification
    useEffect(() => {
        const sendJoinNotification = async () => {
            if (isConnected && !hasSentJoinNotif && patientId && therapistId && auth.currentUser) {
                const targetUserId = isTherapist ? patientId : therapistId;
                const body = isTherapist
                    ? t('notifications.therapist_joined', 'Therapist has joined the session')
                    : t('notifications.patient_joined', 'Patient has joined the session');

                try {
                    await addDoc(collection(db, "notifications"), {
                        title: t('notifications.call_update', 'Call Update'),
                        body: body,
                        timestamp: Timestamp.now(),
                        targetUserIds: [targetUserId],
                        type: 'CALL_JOINED'
                    });
                    setHasSentJoinNotif(true);
                } catch (e) {
                    console.error("Error sending join notification:", e);
                }
            }
        };
        sendJoinNotification();
    }, [isConnected, hasSentJoinNotif, patientId, therapistId, isTherapist, t]);

    // Handle session timing logic (Therapist only updates Firestore)
    useEffect(() => {
        if (!isTherapist || !appointmentId) return;

        const handleStatusChange = async () => {
            const appRef = doc(db, 'appointments', appointmentId);
            const now = Timestamp.now();

            if (isBothConnected) {
                // Both just connected, start a new segment
                if (!lastActiveTimestamp) {
                    await updateDoc(appRef, { lastActiveTimestamp: now });
                    setLastActiveTimestamp(now);
                }
            } else {
                // Someone left, close the segment
                if (lastActiveTimestamp) {
                    const diff = now.seconds - lastActiveTimestamp.seconds;
                    const newTotal = accumulatedDuration + diff;
                    await updateDoc(appRef, {
                        accumulatedDurationSeconds: newTotal,
                        lastActiveTimestamp: null
                    });
                    setAccumulatedDuration(newTotal);
                    setLastActiveTimestamp(null);
                }
            }
        };

        handleStatusChange();
    }, [isBothConnected, isTherapist, appointmentId]);

    // Sync accumulated duration and lastActive from Firestore (especially for patient or after updates)
    useEffect(() => {
        if (!appointmentId) return;
        const unsub = onSnapshot(doc(db, 'appointments', appointmentId), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setAccumulatedDuration(data.accumulatedDurationSeconds || 0);
                setLastActiveTimestamp(data.lastActiveTimestamp || null);
            }
        });
        return () => unsub();
    }, [appointmentId]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (lastActiveTimestamp && isBothConnected) {
                const now = Timestamp.now();
                const diff = now.seconds - lastActiveTimestamp.seconds;
                setElapsedSeconds(accumulatedDuration + diff);
            } else {
                setElapsedSeconds(accumulatedDuration);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [lastActiveTimestamp, isBothConnected, accumulatedDuration]);

    useEffect(() => {
        if (remotePeers.length > 0) {
            const lastPeer = remotePeers[remotePeers.length - 1];
            toast({
                title: t('consultation.peer_joined', 'Participant Joined'),
                description: `${lastPeer.name} ${t('consultation.joined_the_call', 'joined the call')}`,
            });
        }
    }, [remotePeers.length, t]);

    useEffect(() => {
        if (!deviceInfo.hasMic) hmsActions.setLocalAudioEnabled(false);
        if (!deviceInfo.hasCamera) hmsActions.setLocalVideoEnabled(false);
    }, [deviceInfo, hmsActions]);

    // Enforce audio-only: never publish local video for 'call' type
    useEffect(() => {
        const enforceAudioOnly = async () => {
            if (appointmentType === 'call') {
                try {
                    await hmsActions.setLocalVideoEnabled(false);
                } catch (e) {
                    console.warn('Failed to enforce audio-only video off', e);
                }
                setIsVideoOn(false);
            }
        };
        enforceAudioOnly();
    }, [appointmentType, isConnected, hmsActions]);

    const toggleMic = async () => {
        await hmsActions.setLocalAudioEnabled(!isMicOn);
        setIsMicOn(!isMicOn);
    };

    const toggleVideo = async () => {
        await hmsActions.setLocalVideoEnabled(!isVideoOn);
        setIsVideoOn(!isVideoOn);
    };

    const fetchPastNotes = async () => {
        if (!patientId || !auth.currentUser) return;
        setIsLoadingPastNotes(true);
        try {
            const q = query(
                collection(db, "journals"),
                where("userId", "==", patientId),
                where("isTherapistNote", "==", true),
                where("therapistId", "==", auth.currentUser.uid)
            );
            const querySnapshot = await getDocs(q);
            const notes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Manual sort since composite index might be missing
            notes.sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            setPastNotes(notes);
        } catch (e) {
            console.error("Error fetching past notes:", e);
        } finally {
            setIsLoadingPastNotes(false);
        }
    };

    useEffect(() => {
        if (isNotesOpen && isTherapist) {
            fetchPastNotes();
        }
    }, [isNotesOpen, isTherapist]);

    const handleSaveNote = async () => {
        if (!sessionNote.trim() || !patientId || !auth.currentUser) return;
        
        setIsSavingNote(true);
        try {
            if (editingNoteId) {
                await updateDoc(doc(db, "journals", editingNoteId), {
                    description: sessionNote,
                    timestamp: Timestamp.now()
                });
                toast({ title: t('common.success', 'Success'), description: t('consultation.note_updated', 'Note updated') });
            } else {
                await addDoc(collection(db, "journals"), {
                    userId: patientId,
                    title: t('consultation.therapist_note_title', 'Session Note from Therapist'),
                    description: sessionNote,
                    timestamp: Timestamp.now(),
                    isTherapistNote: true,
                    therapistId: auth.currentUser.uid,
                    therapistName: auth.currentUser.displayName || 'Therapist'
                });
                toast({ title: t('common.success', 'Success'), description: t('consultation.note_saved', 'Note added to patient\'s journal') });
            }
            setSessionNote('');
            setEditingNoteId(null);
            fetchPastNotes();
        } catch (e) {
            console.error("Error saving note:", e);
            toast({ title: t('common.error', 'Error'), description: t('consultation.error_save_note', 'Failed to save note'), variant: 'destructive' });
        } finally {
            setIsSavingNote(false);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        try {
            await deleteDoc(doc(db, "journals", noteId));
            toast({ title: t('common.success', 'Success'), description: t('consultation.note_deleted', 'Note deleted') });
            fetchPastNotes();
        } catch (e) {
            console.error("Error deleting note:", e);
            toast({ title: t('common.error', 'Error'), description: t('consultation.error_delete_note', 'Failed to delete note'), variant: 'destructive' });
        }
    };

    const startEditingNote = (note: any) => {
        setSessionNote(note.description);
        setEditingNoteId(note.id);
        setActiveNoteTab('new');
    };

    const handleExit = async (complete: boolean) => {
        if (isTherapist && appointmentId) {
            const appRef = doc(db, 'appointments', appointmentId);
            const now = Timestamp.now();
            const updates: any = {
                lastActiveTimestamp: null
            };

            let finalDuration = accumulatedDuration;

            if (lastActiveTimestamp) {
                const diff = now.seconds - lastActiveTimestamp.seconds;
                finalDuration = accumulatedDuration + diff;
                updates.accumulatedDurationSeconds = finalDuration;
            }

            if (complete) {
                updates.status = 'COMPLETED';
                updates.sessionEndedAt = now;
                updates.sessionDurationSeconds = finalDuration;
                try {
                    const fakeStartTime = new Timestamp(now.seconds - finalDuration, 0);
                    await updateSessionTiming(appointmentId, fakeStartTime, now);
                    await updateAppointmentPayment(appointmentId);
                } catch (e) {
                    console.error("Payroll error:", e);
                }
            }

            await updateDoc(appRef, updates);
        }
        await hmsActions.leave();
        navigate(-1);
    };

    return (
        <div className="h-screen bg-neutral-950 flex relative overflow-hidden bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-900 via-black to-black">
            {/* Top Right: Local Peer Audio Signal */}
            <div className="absolute top-6 right-6 z-20 bg-black/40 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10 flex items-center space-x-3 shadow-2xl">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-white/40 uppercase font-black tracking-[0.2em] leading-none mb-1">{t('common.you', 'You')}</span>
                    <div className="flex items-center space-x-2">
                        {localPeer && <AudioVisualizer peerId={localPeer.id} />}
                    </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/5 overflow-hidden">
                    <span className="text-white text-xs font-bold uppercase">{localPeer?.name?.charAt(0)}</span>
                </div>
            </div>

            {/* Header Timer */}
            {isTherapist && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 flex items-center space-x-3 shadow-2xl">
                    <div className={`w-2 h-2 rounded-full ${isBothConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                    <span className="text-white font-mono text-xl tracking-tight">
                        {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:
                        {(elapsedSeconds % 60).toString().padStart(2, '0')}
                    </span>
                    {!isBothConnected && <span className="text-[10px] text-white/60 uppercase font-bold tracking-widest pl-1">{t('consultation.paused', 'Paused')}</span>}
                </div>
            )}

            {/* Main Content Area */}
            <div className="relative flex-1 h-full overflow-hidden">
                {appointmentType === 'call' ? (
                    /* Audio Call Layout: Centered Avatars of Remote Peers Only */
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8 h-full p-8">
                        {remotePeers.length > 0 ? (
                            remotePeers.map(peer => (
                                <div key={peer.id} className="w-full max-w-sm aspect-square">
                                    <VideoTile peer={peer} isAudioOnly={true} />
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center text-white/20">
                                <div className="w-32 h-32 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center mb-4">
                                    <div className="animate-pulse">{t('consultation.waiting', 'Waiting...')}</div>
                                </div>
                                <span className="text-xs uppercase tracking-widest font-bold opacity-30">{t('consultation.waiting_for_participant', 'Waiting for participant...')}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Video Call Layout: PIP */
                    <div className="relative w-full h-full">
                        {/* Main Participant (Full Screen) */}
                        <div className="w-full h-full p-4">
                            {(() => {
                                const mainPeer = activePeerId === localPeer?.id ? localPeer : peers.find(p => p.id === activePeerId);
                                if (mainPeer) {
                                    return (
                                        <div className="w-full h-full" onClick={() => handleSwap(mainPeer.id)}>
                                            <VideoTile peer={mainPeer} isLocal={mainPeer.id === localPeer?.id} />
                                        </div>
                                    );
                                }
                                return (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-white/20">
                                        <div className="w-32 h-32 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center mb-4">
                                            <div className="animate-pulse">{t('consultation.waiting', 'Waiting...')}</div>
                                        </div>
                                        <span className="text-xs uppercase tracking-widest font-bold opacity-30">{t('consultation.waiting_for_others', 'Waiting for participant...')}</span>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Floating Participant (PIP) */}
                        {(() => {
                            // If local peer is NOT the main peer, show it in PIP
                            // If it IS the main peer, show the first remote peer in PIP
                            const pipPeer = activePeerId === localPeer?.id 
                                ? (remotePeers.length > 0 ? remotePeers[0] : null)
                                : localPeer;

                            if (pipPeer) {
                                return (
                                    <div 
                                        className="absolute top-8 right-8 w-48 md:w-64 lg:w-80 aspect-video z-20 transition-all duration-500 hover:scale-105 cursor-pointer"
                                        onClick={() => handleSwap(pipPeer.id)}
                                    >
                                        <VideoTile peer={pipPeer} isLocal={pipPeer.id === localPeer?.id} />
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* Additional Remote Peers (if any, as smaller tiles at bottom) */}
                        {remotePeers.length > 1 && (
                            <div className="absolute bottom-28 left-8 flex gap-4 overflow-x-auto max-w-[calc(100%-100px)] pb-4 z-10">
                                {remotePeers.filter(p => p.id !== activePeerId && (activePeerId !== localPeer?.id || p.id !== remotePeers[0].id)).map(peer => (
                                    <div key={peer.id} className="w-48 aspect-video flex-shrink-0 cursor-pointer" onClick={() => handleSwap(peer.id)}>
                                        <VideoTile peer={peer} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center space-x-6 bg-white/5 backdrop-blur-xl px-8 py-4 rounded-full border border-white/10 shadow-2xl">
                <Button
                    variant={isMicOn ? "secondary" : "destructive"}
                    size="icon"
                    className={`h-12 w-12 rounded-full transition-all ${isMicOn ? 'bg-white/10 hover:bg-white/20 text-white' : ''}`}
                    onClick={toggleMic}
                >
                    {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>

                {appointmentType !== 'call' && (
                    <Button
                        variant={isVideoOn ? "secondary" : "destructive"}
                        size="icon"
                        className={`h-12 w-12 rounded-full transition-all ${isVideoOn ? 'bg-white/10 hover:bg-white/20 text-white' : ''}`}
                        onClick={toggleVideo}
                    >
                        {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                    </Button>
                )}

                {isTherapist && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
                        onClick={() => setIsNotesOpen(true)}
                    >
                        <StickyNote className="w-5 h-5" />
                    </Button>
                )}

                <Button
                    variant="destructive"
                    size="icon"
                    className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20"
                    onClick={() => setShowExitDialog(true)}
                >
                    <PhoneOff className="w-6 h-6" />
                </Button>
            </div>

            {/* Therapist Notes Sidebar - Responsive: Full screen on mobile, sidebar on desktop */}
            {isTherapist && isNotesOpen && (
                <div 
                    className={`h-full bg-neutral-950/90 backdrop-blur-2xl border-l border-white/10 transition-all duration-500 z-50 flex flex-col shadow-2xl ${isNotesExpanded ? 'w-full md:w-[450px]' : 'w-[0px] border-none overflow-hidden'}`}
                >
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="p-4 md:p-6 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2 md:gap-3">
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-2xl bg-[#92C7CF]/10 flex items-center justify-center">
                                    <StickyNote className="w-4 h-4 md:w-5 md:h-5 text-[#92C7CF]" />
                                </div>
                                <h3 className="text-white font-bold text-base md:text-lg">{t('consultation.session_notes', 'Session Notes')}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-white/40 hover:text-white hover:bg-white/10 h-8 w-8 md:h-10 md:w-10"
                                    onClick={() => setIsNotesExpanded(false)}
                                >
                                    <X className="w-4 h-4 md:w-5 md:h-5" />
                                </Button>
                            </div>
                        </div>

                        <Tabs value={activeNoteTab} onValueChange={setActiveNoteTab} className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-4 md:px-6 mt-3 md:mt-4">
                                <TabsList className="grid w-full grid-cols-2 bg-white/5 p-1 rounded-2xl h-9 md:h-10">
                                    <TabsTrigger value="new" className="rounded-xl data-[state=active]:bg-[#92C7CF] data-[state=active]:text-white transition-all text-xs">
                                        {editingNoteId ? t('consultation.edit_note', 'Edit Note') : t('consultation.new_note', 'Write Note')}
                                    </TabsTrigger>
                                    <TabsTrigger value="history" className="rounded-xl data-[state=active]:bg-[#92C7CF] data-[state=active]:text-white transition-all text-xs">
                                        {t('consultation.past_notes', 'Past Records')}
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="new" className="flex-1 p-4 md:p-6 flex flex-col overflow-y-auto">
                                <p className="text-[10px] text-white/30 mb-3 md:mb-4 uppercase tracking-[0.2em] font-black">
                                    {t('consultation.notes_desc', 'Confidential Observations')}
                                </p>
                                <Textarea
                                    value={sessionNote}
                                    onChange={(e) => setSessionNote(e.target.value)}
                                    placeholder={t('consultation.notes_placeholder', 'Write your session observations...')}
                                    className="flex-1 min-h-[150px] md:min-h-[200px] max-h-[300px] md:max-h-[400px] bg-white/[0.03] border-white/5 rounded-[1.5rem] focus:ring-1 focus:ring-[#92C7CF]/30 focus:border-[#92C7CF]/30 resize-none text-white/90 placeholder:text-white/20 p-4 md:p-5 text-sm leading-relaxed"
                                />
                                <div className="flex justify-end gap-2 md:gap-3 mt-4 md:mt-6">
                                    {editingNoteId && (
                                        <Button
                                            variant="ghost"
                                            onClick={() => {
                                                setEditingNoteId(null);
                                                setSessionNote('');
                                            }}
                                            className="rounded-2xl hover:bg-white/5 text-white/40 h-10 md:h-10 px-3 md:px-4 text-sm"
                                        >
                                            {t('common.cancel', 'Cancel')}
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleSaveNote}
                                        disabled={isSavingNote || !sessionNote.trim()}
                                        className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-2xl px-4 md:px-6 h-10 md:h-10 font-bold transition-all active:scale-95 text-sm"
                                    >
                                        {isSavingNote ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                                        {editingNoteId ? t('common.update', 'Update') : t('common.save', 'Save')}
                                    </Button>
                                </div>
                            </TabsContent>

                            <TabsContent value="history" className="flex-1 overflow-hidden flex flex-col">
                                <ScrollArea className="flex-1 px-6 py-4">
                                    {isLoadingPastNotes ? (
                                        <div className="flex flex-col items-center justify-center py-10 gap-4">
                                            <Loader2 className="w-6 h-6 animate-spin text-[#92C7CF]" />
                                        </div>
                                    ) : pastNotes.length > 0 ? (
                                        <div className="space-y-4 pb-8">
                                            {pastNotes.map((note) => (
                                                <Card key={note.id} className="bg-white/[0.03] border-white/5 p-4 rounded-[1.2rem] relative group hover:bg-white/[0.05] transition-all">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[9px] text-white/30 font-bold uppercase tracking-widest">
                                                            {note.timestamp?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-white/30">
                                                                    <MoreVertical className="w-3 h-3" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="bg-neutral-900 border-white/10 text-white">
                                                                <DropdownMenuItem onClick={() => startEditingNote(note)} className="text-xs">
                                                                    <Edit2 className="w-3 h-3 mr-2" />
                                                                    {t('common.edit', 'Edit')}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleDeleteNote(note.id)} className="text-xs text-red-500">
                                                                    <Trash2 className="w-3 h-3 mr-2" />
                                                                    {t('common.delete', 'Delete')}
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                    <p className="text-white/70 text-xs leading-relaxed whitespace-pre-wrap">
                                                        {note.description}
                                                    </p>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-white/20 text-xs uppercase tracking-widest">{t('consultation.no_past_notes', 'No records found')}</div>
                                    )}
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            )}

            {/* Collapsed Sidebar Toggle - Hidden on mobile since notes take full screen */}
            {isTherapist && isNotesOpen && !isNotesExpanded && (
                <Button 
                    className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 h-16 w-12 rounded-2xl bg-[#92C7CF] hover:bg-[#7FB0B8] text-white shadow-2xl z-50 flex-col gap-2 items-center justify-center animate-in slide-in-from-right duration-300"
                    onClick={() => setIsNotesExpanded(true)}
                >
                    <StickyNote className="w-6 h-6" />
                    <span className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-bold tracking-widest uppercase">Notes</span>
                </Button>
            ) }

            {/* Exit Dialog */}
            {showExitDialog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-gray-900 border border-white/10 rounded-[32px] p-8 max-w-md w-full shadow-2xl">
                        <h3 className="text-2xl font-bold text-white mb-2">{t('consultation.end_session_title', 'End Session?')}</h3>
                        <p className="text-gray-400 mb-8 font-sans">
                            {t('consultation.leave_confirm_desc', 'Leave the room or end the session permanently?')}
                        </p>
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-4">
                                <Button
                                    onClick={() => setShowExitDialog(false)}
                                    variant="outline"
                                    className="flex-1 h-12 rounded-xl bg-transparent border-white/10 text-white hover:bg-white/5"
                                >
                                    {t('consultation.cancel', 'Cancel')}
                                </Button>
                                <Button
                                    onClick={() => handleExit(false)}
                                    className="flex-1 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white border-none"
                                >
                                    {t('consultation.leave_session', 'Leave Room')}
                                </Button>
                            </div>
                            {isTherapist && (
                                <Button
                                    onClick={() => handleExit(true)}
                                    className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                                >
                                    {t('consultation.end_session', 'End Session Permanently')}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Call = () => {
    const { appointmentId } = useParams();
    const { t } = useTranslation();
    const [token, setToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [appointmentType, setAppointmentType] = useState<string | null>(null);
    const [deviceInfo, setDeviceInfo] = useState({ hasCamera: true, hasMic: true });
    const navigate = useNavigate();

    useEffect(() => {
        const fetchToken = async () => {
            if (!appointmentId || !auth.currentUser) return;
            try {
                // 1. Fetch Appointment Data first to know the type
                const appDoc = await getDoc(doc(db, "appointments", appointmentId));
                if (!appDoc.exists()) throw new Error(t('consultation.not_found', 'Appointment not found'));

                const app = appDoc.data();
                const apptType = app.appointmentType || 'video';
                setAppointmentType(apptType);

                // 2. Check for start time
                if (app.startTimestamp) {
                    const diff = (app.startTimestamp.toDate().getTime() - Date.now()) / (1000 * 60);
                    if (diff > 15) {
                        toast({
                            title: t('consultation.not_started_title', 'Too Early'),
                            description: t('consultation.not_started_desc', 'You can join 15 mins before.'),
                            variant: 'destructive'
                        });
                        navigate(-1);
                        return;
                    }
                }

                // 3. Device Check - Only request camera if it's NOT a 'call' type
                let hasCamera = false;
                let hasMic = false;
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    hasCamera = devices.some(d => d.kind === 'videoinput');
                    hasMic = devices.some(d => d.kind === 'audioinput');
                    
                    // Don't even try to access camera if it's an audio-only call
                    const shouldRequestVideo = hasCamera && apptType !== 'call';
                    setDeviceInfo({ hasCamera: shouldRequestVideo, hasMic });

                    if (shouldRequestVideo || hasMic) {
                        const s = await navigator.mediaDevices.getUserMedia({ 
                            video: shouldRequestVideo, 
                            audio: hasMic 
                        });
                        s.getTracks().forEach(track => track.stop());
                    }
                } catch (e) { 
                    console.warn('Device permission/check error:', e); 
                }

                const genToken = httpsCallable(functions, 'generate100msToken');
                let hmsRoomId = app.hmsRoomId;
                if (!hmsRoomId) {
                    const createRes = await genToken({ mode: 'create', appointmentId });
                    // @ts-ignore
                    hmsRoomId = createRes.data.roomId;
                }

                const res = await genToken({
                    mode: 'token',
                    roomId: hmsRoomId,
                    userId: auth.currentUser.uid,
                    role: 'host'
                });
                // @ts-ignore
                setToken(res.data.token);
            } catch (err: any) {
                console.error(err);
                setError(err.message);
                toast({ title: t('common.error', 'Error'), description: err.message, variant: "destructive" });
                setTimeout(() => navigate(-1), 4000);
            }
        };
        fetchToken();
    }, [appointmentId, navigate, t]);

    if (error) return (
        <div className="h-screen flex items-center justify-center bg-black text-white p-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">{t('common.error', 'Error')}</h2>
                <p className="text-gray-400">{error}</p>
            </div>
        </div>
    );

    if (!token) return (
        <div className="h-screen flex items-center justify-center bg-black text-white p-6">
            <div className="text-center font-sans">
                <div className="animate-spin h-10 w-10 border-4 border-white/20 rounded-full border-t-white mx-auto mb-4"></div>
                <p className="text-gray-400 uppercase tracking-widest text-xs">{t('consultation.loading', 'Connecting...')}</p>
            </div>
        </div>
    );

    return (
        <HMSRoomProvider>
            <JoinRoom token={token} deviceInfo={deviceInfo} appointmentType={appointmentType || 'video'} />
        </HMSRoomProvider>
    );
};

const JoinRoom = ({ token, deviceInfo, appointmentType }: { token: string, deviceInfo: { hasCamera: boolean, hasMic: boolean }, appointmentType: string }) => {
    const hmsActions = useHMSActions();
    const isConnected = useHMSStore(selectIsConnectedToRoom);
    const { t } = useTranslation();

    useEffect(() => {
        hmsActions.join({ 
            authToken: token, 
            userName: auth.currentUser?.displayName || "User",
            settings: {
                isVideoMuted: appointmentType === 'call',
                isAudioMuted: false
            }
        });
        return () => { hmsActions.leave(); };
    }, [token, hmsActions, appointmentType]);

    if (!isConnected) return (
        <div className="h-screen flex items-center justify-center bg-black text-white p-6">
            <div className="text-center">
                <div className="animate-spin h-10 w-10 border-4 border-white/20 rounded-full border-t-white mx-auto mb-4"></div>
                <p className="text-gray-400 font-sans tracking-wide uppercase text-xs">{t('consultation.entering', 'Entering room...')}</p>
            </div>
        </div>
    );

    return <Room deviceInfo={deviceInfo} />;
}

export default Call;
