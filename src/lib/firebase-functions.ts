import { functions } from "./firebase";
import { httpsCallable } from "firebase/functions";

export const createAndSendNotification = async (data: {
    title: string;
    message: string;
    titleKey?: string;
    messageKey?: string;
    params?: Record<string, any>;
    type?: string;
    targetUserIds?: string[];
    targetRoles?: string[];
    global?: boolean;
    appointmentId?: string;
    userId?: string;
    metadata?: Record<string, string>;
    clickAction?: {
        type: "PROFILE" | "APPOINTMENT" | "URL";
        id?: string;
        url?: string;
    };
}) => {
    const notifyFn = httpsCallable(functions, "createAndSendNotification");
    return notifyFn(data);
};
