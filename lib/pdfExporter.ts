// lib/pdfExporter.ts
import { Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Student } from './studentsDb';

export const exportStudentsToPdf = async (students: Student[]) => {
    if (!students.length) {
        Alert.alert('تنبيه', 'لا توجد بيانات لتصديرها.');
        return;
    }

    let htmlContent = `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
                <style>
                    body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; direction: rtl; text-align: right; }
                    h1 { text-align: center; color: #333; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 10px; border: 1px solid #ddd; word-wrap: break-word; }
                    th { background-color: #f2f2f2; color: #555; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    .student-info { font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>تقرير الطلاب</h1>
                <table>
                    <thead>
                        <tr>
                            <th>م.</th> <th>الاسم</th>
                            <th>المركز</th>
                            <th>المستوى</th>
                            <th>تاريخ الميلاد</th>
                            <th>رقم الهاتف</th>
                            <th>العنوان</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    students.forEach((student, index) => { // تعديل حلقة التكرار لاستخدام الـ index
        htmlContent += `
            <tr>
                <td>${index + 1}</td> <td>${student.name}</td>
                <td>${student.office_name || ''}</td>
                <td>${student.level_name || ''}</td>
                <td>${student.birth_date || ''}</td>
                <td>${student.phone || ''}</td>
                <td>${student.address || ''}</td>
            </tr>
        `;
    });

    htmlContent += `
                    </tbody>
                </table>
            </body>
        </html>
    `;

    try {
        const { uri } = await Print.printToFileAsync({
            html: htmlContent,
            base64: false
        });

        if (Platform.OS === 'ios') {
            await Sharing.shareAsync(uri);
        } else {
            const printOptions = { uri };
            await Print.printAsync(printOptions);
        }

        Alert.alert('تم', 'تم تجهيز تقرير الطلاب بنجاح للمشاركة أو الطباعة.');
    } catch (error) {
        console.error('❌ خطأ في إنشاء أو مشاركة ملف PDF:', error);
        Alert.alert('خطأ', 'فشل في إنشاء ملف PDF.');
    }
};