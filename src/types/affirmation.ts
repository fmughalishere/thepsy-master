import { Timestamp } from 'firebase/firestore';

export interface Affirmation {
    id: string;
    text: string;
    text_de?: string;
    text_el?: string;
    text_hr?: string;
    date: string; // "yyyy-MM-dd"
    createdAt: Timestamp;
    updatedAt: Timestamp;
    isActive: boolean;
}
