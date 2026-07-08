import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

import { enUS, de as deLocale, el as elLocale, hr as hrLocale } from "date-fns/locale";
import type { Locale } from "date-fns";

const localeMap: Record<string, Locale> = {
    en: enUS,
    de: deLocale,
    el: elLocale,
    hr: hrLocale
};

interface Transaction {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    planName: string;
    amount: string;
    status: string;
    timestamp: Timestamp;
    paymentMethod: string;
}


const Transactions = () => {
    const { t, i18n } = useTranslation();
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const localeKey = i18n.language?.split("-")[0] || "en";
    const dateLocale = localeMap[localeKey as keyof typeof localeMap] ?? enUS;

    useEffect(() => {
        const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const transactionsData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Transaction[];
            setTransactions(transactionsData);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">{t('admin.transactions.title')}</h1>
                    <p className="text-sm text-gray-500 font-shippori">{t('admin.transactions.subtitle', 'Monitor financial transactions and payment history')}</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('admin.transactions.recent')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('admin.transactions.table.date')}</TableHead>
                                    <TableHead>{t('admin.transactions.table.user')}</TableHead>
                                    <TableHead>{t('admin.transactions.table.plan')}</TableHead>
                                    <TableHead>{t('admin.transactions.table.amount')}</TableHead>
                                    <TableHead>{t('admin.transactions.table.status')}</TableHead>
                                    <TableHead>{t('admin.transactions.table.payment_method')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                                            {t('admin.transactions.table.empty')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transactions.map((transaction) => (
                                        <TableRow key={transaction.id}>
                                            <TableCell className="font-medium">
                                                {transaction.timestamp ? format(transaction.timestamp.toDate(), "PPpp", { locale: dateLocale }) : t('admin.transactions.table.na')}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{transaction.userName || t('admin.transactions.table.unknown_user')}</span>
                                                    <span className="text-xs text-gray-500">{transaction.userEmail}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{transaction.planName}</TableCell>
                                            <TableCell className="font-bold text-green-600">{transaction.amount}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                    {transaction.status || t('admin.transactions.table.completed')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="capitalize">{transaction.paymentMethod || t('admin.transactions.table.card')}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Transactions;
