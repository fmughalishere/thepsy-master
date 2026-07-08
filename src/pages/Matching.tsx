import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, getDoc, updateDoc, query, collection, where, getDocs, addDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const Matching = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const [status, setStatus] = useState<string>("initializing");

    const excludedTherapistId = location.state?.excludedTherapistId;

    useEffect(() => {
        const matchTherapist = async () => {
            if (!auth.currentUser) return;

            try {
                // 0. Check if already has a therapist
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    if (data.patientDetails?.assignedTherapist) {
                        console.log("User already has a therapist. Skipping matching.");
                        setStatus("found");
                        setTimeout(() => navigate("/dashboard"), 1000);
                        return;
                    }
                }

                setStatus("searching");
                // 1. Find approved therapists
                const q = query(
                    collection(db, "users"),
                    where("role", "in", ["THERAPIST", "therapist"]),
                    where("therapistDetails.profileStatus", "==", "APPROVED")
                );

                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    // 2. Filter out excluded therapist and pick a RANDOM one
                    let therapists = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                    if (excludedTherapistId) {
                        therapists = therapists.filter(t => (t as any).id !== excludedTherapistId);
                    }

                    if (therapists.length === 0) {
                        console.warn("No therapists found after exclusion.");
                        setStatus("searching");
                        return;
                    }

                    const selectedTherapist = therapists[Math.floor(Math.random() * therapists.length)];
                    const therapistId = (selectedTherapist as any).id;

                    console.log("Matched with therapist:", therapistId);

                    // 3. Create Conversation WITH EXPLICIT ID
                    const conversationRef = doc(collection(db, "conversations"));
                    const conversationId = conversationRef.id;

                    await setDoc(conversationRef, {
                        id: conversationId,
                        patientId: auth.currentUser.uid,
                        therapistId: therapistId,
                        participants: [auth.currentUser.uid, therapistId],
                        occupants: [auth.currentUser.uid, therapistId],
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        lastMessage: null,
                        unreadCount: 0
                    });

                    console.log("Created conversation:", conversationId);

                    // 4. Update the CURRENT USER with the assigned therapist AND conversation ID
                    await updateDoc(doc(db, "users", auth.currentUser.uid), {
                        "patientDetails.assignedTherapist": therapistId,
                        "patientDetails.conversationId": conversationId,
                        "patientDetails.matchingTimestamp": serverTimestamp()
                    });

                    // 5. Create Notification
                    await addDoc(collection(db, "notifications"), {
                        message: t('matching.found'),
                        type: "ASSIGNED",
                        targetUserIds: [auth.currentUser.uid, therapistId],
                        timestamp: serverTimestamp(),
                        read: false
                    });

                    setStatus("found");

                    // Navigate to Dashboard
                    setTimeout(() => {
                        navigate("/dashboard");
                    }, 1500);

                } else {
                    console.warn("No therapists found in database.");
                    setStatus("searching");
                }
            } catch (e) {
                console.error("Error matching:", e);
                setStatus("searching");
            }
        };

        matchTherapist();
    }, [navigate]);

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">

            {/* Pulse Animation */}
            <div className="relative mb-12">
                <div className="absolute inset-0 bg-[#E3F2FD] rounded-full animate-ping opacity-75" />
                <div className="relative w-32 h-32 bg-[#E3F2FD] rounded-full flex items-center justify-center">
                    <div className="w-20 h-20 bg-[#92C7CF] rounded-full shadow-lg" />
                </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-4 font-sans text-center">
                {status === "searching" || status === "initializing"
                    ? t('matching.title')
                    : t('matching.found')}
            </h2>

            <p className="text-gray-500 text-center max-w-sm">
                {(status === "searching" || status === "initializing")
                    ? t('matching.subtitle')
                    : t('matching.redirect')}
            </p>

        </div>
    );
};

export default Matching;
