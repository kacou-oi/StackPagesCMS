// Ce script gère l'envoi du formulaire de contact
document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');

    contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());

        formStatus.textContent = 'Envoi en cours...';
        formStatus.classList.remove('text-green-500', 'text-red-500');
        formStatus.classList.add('text-gray-500');

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                formStatus.textContent = result.message;
                formStatus.classList.remove('text-gray-500', 'text-red-500');
                formStatus.classList.add('text-green-500');
                contactForm.reset();
            } else {
                throw new Error(result.error || 'Une erreur est survenue.');
            }

        } catch (error) {
            console.error('Erreur:', error);
            formStatus.textContent = `Erreur: ${error.message}`;
            formStatus.classList.remove('text-gray-500', 'text-green-500');
            formStatus.classList.add('text-red-500');
        }
    });
});
