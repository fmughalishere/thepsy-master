
import os
import re

def update_locale(file_path, trans):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Create the complete auth block
    auth_block = f"""\n        "auth": {{
            "email_required": "{trans['auth']['email_required']}",
            "reset_email_sent": "{trans['auth']['reset_email_sent']}",
            "resend": "{trans['auth']['resend']}",
            "reset_check_email": "{trans['auth']['reset_check_email']}",
            "reset_desc": "{trans['auth']['reset_desc']}",
            "send_reset_link": "{trans['auth']['send_reset_link']}",
            "back_to_login": "{trans['auth']['back_to_login']}",
            "forgot_password": {{
                "title": "{trans['auth']['forgot_password_title']}",
                "subtitle": "{trans['auth']['forgot_password_subtitle']}",
                "email": "{trans['auth']['forgot_password_email']}",
                "placeholder": "{trans['auth']['forgot_password_placeholder']}"
            }},
            "errors": {{
                "failed_send": "{trans['auth']['error_failed_send']}",
                "user_not_found": "{trans['auth']['error_user_not_found']}"
            }}
        }},"""

    # Create role_selection block
    role_block = f"""\n        "role_selection": {{
            "title": "{trans['role_selection']['title']}",
            "therapist": {{ "label": "{trans['role_selection']['therapist']}" }},
            "client": {{ "label": "{trans['role_selection']['client']}" }}
        }},"""

    # Create welcome block
    welcome_block = f"""\n        "welcome": {{
            "intro_title": "{trans['welcome']['intro_title']}",
            "intro_subtitle": "{trans['welcome']['intro_subtitle']}",
            "get_started": "{trans['welcome']['get_started']}"
        }},"""

    # Create gender block if missing
    gender_block = f"""\n        "gender": {{
            "male": "{trans['gender']['male']}",
            "female": "{trans['gender']['female']}",
            "other": "{trans['gender']['other']}"
        }},"""

    # Add blocks to content
    # For now, just prepend to translation block for simplicity
    if '"auth": {' in content:
        content = re.sub(r'"auth": \{.*?\},', auth_block, content, flags=re.DOTALL)
    else:
        content = content.replace('translation: {', f'translation: {{{auth_block}')

    if '"role_selection": {' in content:
        content = re.sub(r'"role_selection": \{.*?\},', role_block, content, flags=re.DOTALL)
    else:
        content = content.replace('translation: {', f'translation: {{{role_block}')

    if '"welcome": {' in content:
        content = re.sub(r'"welcome": \{.*?\},', welcome_block, content, flags=re.DOTALL)
    else:
        content = content.replace('translation: {', f'translation: {{{welcome_block}')

    if '"gender": {' not in content:
        content = content.replace('translation: {', f'translation: {{{gender_block}')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

data = {
    'en': {
        'auth': {
            'email_required': 'Please enter your email address first',
            'reset_email_sent': 'Password reset email sent!',
            'resend': 'Resend Email',
            'reset_check_email': 'Check your email for the reset link',
            'reset_desc': 'Enter your email to receive a reset link',
            'send_reset_link': 'Send Reset Link',
            'back_to_login': 'Back to Login',
            'forgot_password_title': 'Reset Password',
            'forgot_password_subtitle': 'Enter your email to receive a reset link',
            'forgot_password_email': 'Email Address',
            'forgot_password_placeholder': 'your@email.com',
            'error_failed_send': 'Failed to send reset email',
            'error_user_not_found': 'No account found with this email'
        },
        'role_selection': {
            'title': 'Who are you?',
            'therapist': 'Therapist',
            'client': 'Patient'
        },
        'welcome': {
            'intro_title': 'Professional, Licensed and Tilted',
            'intro_subtitle': 'Your mental health matters. Explore our range of therapeutic services designed to support you.',
            'get_started': 'Get Started'
        },
        'gender': { 'male': 'Male', 'female': 'Female', 'other': 'Other' }
    },
    'de': {
        'auth': {
            'email_required': 'Bitte geben Sie zuerst Ihre E-Mail-Adresse ein',
            'reset_email_sent': 'E-Mail zum Zurücksetzen des Passworts gesendet!',
            'resend': 'E-Mail erneut senden',
            'reset_check_email': 'Überprüfen Sie Ihre E-Mail auf den Reset-Link',
            'reset_desc': 'Geben Sie Ihre E-Mail ein, um einen Reset-Link zu erhalten',
            'send_reset_link': 'Reset-Link senden',
            'back_to_login': 'Zurück zum Login',
            'forgot_password_title': 'Passwort zurücksetzen',
            'forgot_password_subtitle': 'Geben Sie Ihre E-Mail ein, um einen Reset-Link zu erhalten',
            'forgot_password_email': 'E-Mail-Adresse',
            'forgot_password_placeholder': 'ihre@email.de',
            'error_failed_send': 'E-Mail zum Zurücksetzen konnte nicht gesendet werden',
            'error_user_not_found': 'Kein Konto mit dieser E-Mail gefunden'
        },
        'role_selection': {
            'title': 'Wer sind Sie?',
            'therapist': 'Therapeut',
            'client': 'Patient'
        },
        'welcome': {
            'intro_title': 'Professionell, lizenziert und qualifiziert',
            'intro_subtitle': 'Ihre psychische Gesundheit ist wichtig. Entdecken Sie unser Angebot an therapeutischen Dienstleistungen.',
            'get_started': 'Jetzt loslegen'
        },
        'gender': { 'male': 'Männlich', 'female': 'Weiblich', 'other': 'Andere' }
    },
    'el': {
        'auth': {
            'email_required': 'Παρακαλούμε εισάγετε πρώτα τη διεύθυνση email σας',
            'reset_email_sent': 'Το email επαναφοράς κωδικού στάλθηκε!',
            'resend': 'Επαναποστολή Email',
            'reset_check_email': 'Ελέγξτε το email σας για τον σύνδεσμο επαναφοράς',
            'reset_desc': 'Εισάγετε το email σας για να λάβετε έναν σύνδεσμο επαναφοράς',
            'send_reset_link': 'Αποστολή Συνδέσμου Επαναφοράς',
            'back_to_login': 'Επιστροφή στην Είσοδο',
            'forgot_password_title': 'Επαναφορά Κωδικού Πρόσβασης',
            'forgot_password_subtitle': 'Εισάγετε το email σας για να λάβετε έναν σύνδεσμο επαναφοράς',
            'forgot_password_email': 'Διεύθυνση Email',
            'forgot_password_placeholder': 'to@email.sas',
            'error_failed_send': 'Αποτυχία αποστολής email επαναφοράς',
            'error_user_not_found': 'Δεν βρέθηκε λογαριασμός με αυτό το email'
        },
        'role_selection': {
            'title': 'Ποιος είστε;',
            'therapist': 'Θεραπευτής',
            'client': 'Ασθενής'
        },
        'welcome': {
            'intro_title': 'Επαγγελματική, Αδειοδοτημένη και Εξειδικευμένη Φροντίδα',
            'intro_subtitle': 'Η ψυχική σας υγεία έχει σημασία. Εξερευνήστε τις υπηρεσίες μας που έχουν σχεδιαστεί για να σας υποστηρίξουν.',
            'get_started': 'Ξεκινήστε'
        },
        'gender': { 'male': 'Άνδρας', 'female': 'Γυναίκα', 'other': 'Άλλο' }
    },
    'hr': {
        'auth': {
            'email_required': 'Prvo unesite svoju adresu e-pošte',
            'reset_email_sent': 'E-pošta za ponovno postavljanje lozinke je poslana!',
            'resend': 'Ponovno pošalji e-poštu',
            'reset_check_email': 'Provjerite svoju e-poštu za poveznicu za resetiranje',
            'reset_desc': 'Unesite svoju e-poštu da biste primili poveznicu za resetiranje',
            'send_reset_link': 'Pošalji poveznicu za resetiranje',
            'back_to_login': 'Povratak na prijavu',
            'forgot_password_title': 'Resetiranje lozinke',
            'forgot_password_subtitle': 'Unesite svoju e-poštu da biste primili poveznicu za resetiranje',
            'forgot_password_email': 'Adresa e-pošte',
            'forgot_password_placeholder': 'vasa@email.hr',
            'error_failed_send': 'Slanje e-pošte za resetiranje nije uspjelo',
            'error_user_not_found': 'Nije pronađen račun s ovom e-poštom'
        },
        'role_selection': {
            'title': 'Tko ste vi?',
            'therapist': 'Therapeut',
            'client': 'Pacijent'
        },
        'welcome': {
            'intro_title': 'Profesionalna, licencirana i stručna njega',
            'intro_subtitle': 'Vaše mentalno zdravlje je važno. Istražite naš raspon terapeutskih usluga dizajniranih da vam pruže podršku.',
            'get_started': 'Započnite'
        },
        'gender': { 'male': 'Muško', 'female': 'Žensko', 'other': 'Ostalo' }
    }
}

base_path = 'c:/Users/Dastageer/AndroidStudioProjects/ThePsyFullStack/psy_web/src/i18n/locales/'
for lang in ['en', 'de', 'el', 'hr']:
    file_path = os.path.join(base_path, f'{lang}.ts')
    if os.path.exists(file_path):
        update_locale(file_path, data[lang])
        print(f"Updated {lang}.ts")
