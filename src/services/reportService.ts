import { db } from "@/lib/firebase";
import {
    collection,
    query,
    orderBy,
    limit,
    startAfter,
    getDocs,
    doc,
    updateDoc,
    getDoc,
    Timestamp,
    increment,
    where
} from "firebase/firestore";

export interface Report {
    id: string;
    reporterId: string;
    reportedUserId: string;
    category: string;
    subcategory: string;
    message: string;
    timestamp: Timestamp;
    status: "PENDING" | "RESOLVED";
    resolvedAt?: Timestamp;
    resolvedBy?: string;
    reporter?: UserProfile;
    reportedUser?: UserProfile;
}

export interface UserProfile {
    uid: string;
    displayName: string;
    email: string;
    photoUrl?: string;
    role: string;
    isBlocked?: boolean;
}

const PAGE_SIZE = 20;

export const reportService = {
    // Fetch reports with pagination
    async getReports(lastDoc?: any, statusFilter: string = "ALL") {
        try {
            let q = query(
                collection(db, "reports"),
                orderBy("timestamp", "desc"),
                limit(PAGE_SIZE)
            );

            if (statusFilter !== "ALL") {
                q = query(
                    collection(db, "reports"),
                    where("status", "==", statusFilter),
                    orderBy("timestamp", "desc"),
                    limit(PAGE_SIZE)
                );
            }

            if (lastDoc) {
                q = query(
                    collection(db, "reports"),
                    orderBy("timestamp", "desc"),
                    startAfter(lastDoc),
                    limit(PAGE_SIZE)
                );

                if (statusFilter !== "ALL") {
                    q = query(
                        collection(db, "reports"),
                        where("status", "==", statusFilter),
                        orderBy("timestamp", "desc"),
                        startAfter(lastDoc),
                        limit(PAGE_SIZE)
                    );
                }
            }

            const snapshot = await getDocs(q);
            const reports: Report[] = [];

            for (const docSnapshot of snapshot.docs) {
                const reportData = docSnapshot.data() as Omit<Report, "id" | "reporter" | "reportedUser">;

                // Fetch user details for each report
                const [reporter, reportedUser] = await Promise.all([
                    this.getUserProfile(reportData.reporterId),
                    this.getUserProfile(reportData.reportedUserId)
                ]);

                reports.push({
                    id: docSnapshot.id,
                    ...reportData,
                    reporter,
                    reportedUser
                });
            }

            return {
                reports,
                lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
                hasMore: snapshot.docs.length === PAGE_SIZE
            };
        } catch (error) {
            console.error("Error fetching reports:", error);
            throw error;
        }
    },

    // Get user profile helper
    async getUserProfile(userId: string): Promise<UserProfile | undefined> {
        if (!userId) return undefined;
        try {
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
                const data = userDoc.data();
                return {
                    uid: userDoc.id,
                    displayName: data.displayName || "Unknown User",
                    email: data.email || "",
                    photoUrl: data.photoUrl,
                    role: data.role,
                    isBlocked: data.isBlocked || false
                };
            }
            return undefined;
        } catch (error) {
            console.error(`Error fetching user profile ${userId}:`, error);
            return undefined;
        }
    },

    // Resolve a report
    async resolveReport(reportId: string, adminId: string) {
        try {
            const reportRef = doc(db, "reports", reportId);
            await updateDoc(reportRef, {
                status: "RESOLVED",
                resolvedAt: Timestamp.now(),
                resolvedBy: adminId
            });
            return true;
        } catch (error) {
            console.error("Error resolving report:", error);
            throw error;
        }
    },

    // Toggle user block status
    async toggleUserBlockStatus(userId: string, currentStatus: boolean, adminId: string) {
        try {
            const userRef = doc(db, "users", userId);
            const newStatus = !currentStatus;

            const updateData: any = {
                isBlocked: newStatus,
                blockedBy: newStatus ? adminId : null,
                blockedAt: newStatus ? Timestamp.now() : null
            };

            // Handle therapist profile status updates
            try {
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.role === "THERAPIST" || userData.role === "therapist") {
                        if (newStatus) {
                            updateData["therapistDetails.profileStatus"] = "BLOCKED";
                        } else {
                            // When unblocking, set to COOLDOWN status
                            updateData["therapistDetails.profileStatus"] = "COOLDOWN";
                        }
                    }
                }
            } catch (e) {
                console.warn("Could not fetch user before updating block status:", e);
            }

            await updateDoc(userRef, updateData);
            return newStatus;
        } catch (error) {
            console.error("Error updating user block status:", error);
            throw error;
        }
    }
};
