document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contact-form');
    const statusDiv = document.getElementById('form-status');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Simple validation
        if (!data.name || !data.email || !data.message) {
            updateStatus('Veuillez remplir tous les champs.', 'text-red-600');
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Envoi en cours...';

        try {
            const response = await fetch('/api/form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Une erreur est survenue.');
            }

            updateStatus(result.message, 'text-green-600');
            form.reset();

        } catch (error) {
            console.error('Erreur lors de la soumission du formulaire:', error);
            updateStatus(error.message, 'text-red-600');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Envoyer le message';
        }
    });

    function updateStatus(message, colorClass) {
        statusDiv.textContent = message;
        statusDiv.className = `text-center text-sm font-semibold ${colorClass}`;
    }
});
