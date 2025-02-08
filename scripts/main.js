import gsap from "/scripts/greensock/esm/all.js";

class CombatTimeline {
    constructor() {
        this.timelineContainer = null;
        this.combatants = new Map();
        this.isVisible = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.turnNotification = null;
        this.isCombatStarted = false;
        this.currentActiveToken = null;
        this.currentAuraToken = null;
    }

    initialize() {
        this.createTimelineUI();
        this.registerEventListeners();
        
        // S'assurer que le module est caché au démarrage
        if (this.timelineContainer) {
            this.timelineContainer.classList.add('hidden');
        }
        
        // Vérifier si un combat est déjà en cours et si des initiatives sont lancées
        if (game.combat) {
            const hasInitiative = game.combat.turns.some(combatant => combatant.initiative !== null);
            if (hasInitiative) {
                this.onCombatStart(game.combat);
            }
        }
    }

    createTimelineUI() {
        this.timelineContainer = document.createElement('div');
        this.timelineContainer.id = 'combat-timeline';
        this.timelineContainer.classList.add('hidden');
        
        const template = `
            <div class="timeline-header">
                <div class="header-left">
                    <div class="drag-handle">⋮⋮</div>
                    <span id="combat-round" class="round-counter">${game.i18n.localize('SCIFIBATTLE.UI.Round')} 1</span>
                </div>
                <div class="header-right">
                    <button class="initiative-button npc">${game.i18n.localize('SCIFIBATTLE.Buttons.NPCInitiative')}</button>
                    <button class="initiative-button">${game.i18n.localize('SCIFIBATTLE.Buttons.AllInitiative')}</button>
                </div>
            </div>
            <div class="combatants-container"></div>
            <div class="timeline-footer">
                <div class="previous-controls">
                    <button class="control-button previous-round">◀◀</button>
                    <button class="control-button previous-turn">◀</button>
                </div>
                <div class="control-labels">
                    <span class="control-label">${game.i18n.localize('SCIFIBATTLE.UI.RoundTurn')}</span>
                    <button class="start-combat-button">${game.i18n.localize('SCIFIBATTLE.Buttons.StartCombat')}</button>
                    <button class="control-button end-combat">${game.i18n.localize('SCIFIBATTLE.Buttons.EndCombat')}</button>
                </div>
                <div class="next-controls">
                    <button class="control-button next-turn">▶</button>
                    <button class="control-button next-round">▶▶</button>
                </div>
            </div>
        `;
        
        this.timelineContainer.innerHTML = template;
        document.body.appendChild(this.timelineContainer);
        
        this.initializeDragAndDrop();
        
        // Ajout des écouteurs d'événements
        const nextTurnBtn = this.timelineContainer.querySelector('.next-turn');
        const prevTurnBtn = this.timelineContainer.querySelector('.previous-turn');
        const nextRoundBtn = this.timelineContainer.querySelector('.next-round');
        const prevRoundBtn = this.timelineContainer.querySelector('.previous-round');
        const endCombatBtn = this.timelineContainer.querySelector('.end-combat');
        
        nextTurnBtn.addEventListener('click', () => this.nextTurn());
        prevTurnBtn.addEventListener('click', () => this.previousTurn());
        nextRoundBtn.addEventListener('click', () => this.nextRound());
        prevRoundBtn.addEventListener('click', () => this.previousRound());
        endCombatBtn.addEventListener('click', () => this.endCombat());
        
        // Ajout des écouteurs pour les nouveaux boutons
        const rollNPCButton = this.timelineContainer.querySelector('.initiative-button.npc');
        const rollAllButton = this.timelineContainer.querySelector('.initiative-button:not(.npc)');
        
        rollNPCButton?.addEventListener('click', () => {
            this.showInitiativeConfirm('PNJ');
        });
        
        rollAllButton?.addEventListener('click', () => {
            this.showInitiativeConfirm('TOUS');
        });
        
        // Gestion des éléments réservés au GM
        const gmOnlyElements = this.timelineContainer.querySelectorAll('.initiative-button, .end-combat, .control-button, .start-combat-button');
        if (!game.user.isGM) {
            gmOnlyElements.forEach(element => element.remove());
        }
        
        // Ajouter l'écouteur d'événement pour le nouveau bouton
        const startCombatBtn = this.timelineContainer.querySelector('.start-combat-button');
        if (startCombatBtn) {
            startCombatBtn.addEventListener('click', () => this.startCombat());
        }
    }

    initializeDragAndDrop() {
        const dragHandle = this.timelineContainer.querySelector('.drag-handle');
        
        dragHandle.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            const rect = this.timelineContainer.getBoundingClientRect();
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            this.timelineContainer.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;
            
            this.timelineContainer.style.left = `${x}px`;
            this.timelineContainer.style.top = `${y}px`;
            this.timelineContainer.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.timelineContainer.style.transition = 'all 0.2s ease';
        });
    }

    registerEventListeners() {
        // Écouter la création d'un combat
        Hooks.on('createCombat', (combat) => {
            this.isVisible = true;
            if (this.timelineContainer) {
                this.timelineContainer.classList.remove('hidden');
            }
            this.updateCombatants(combat);
        });
        
        // Écouter les mises à jour du combat
        Hooks.on('updateCombat', (combat, changes, options, userId) => {
            this.onCombatUpdate(combat);
        });
        
        // Écouter la fin du combat
        Hooks.on('deleteCombat', (combat, options, userId) => {
            this.onCombatEnd();
        });

        // Écouter le début du combat
        Hooks.on('combatStart', (combat) => {
            this.isCombatStarted = true;
            this.onCombatStart(combat);
        });

        // Écouter les changements de tour
        Hooks.on('updateCombat', (combat, update, options) => {
            if (combat && combat.turns[combat.turn]) {
                this.showTurnNotification(combat.turns[combat.turn]);
            }
        });

        // Écouter les changements d'initiative
        Hooks.on('updateCombatant', (combatant, changes, options, userId) => {
            
            // Si l'initiative vient d'être définie
            if ('initiative' in changes) {
                const combat = game.combat;
                if (combat) {
                    // Vérifier si c'est la première initiative lancée
                    const hasInitiative = combat.turns.some(c => c.initiative !== null);
                    if (hasInitiative && !this.isVisible) {
                        this.onCombatStart(combat);
                    }
                    this.updateCombatants(combat);
                }
            }
            
            // Forcer la mise à jour de l'interface pour tous
            if (game.combat) {
                this.onCombatUpdate(game.combat);
            }
        });

        // Ajouter un hook pour détecter l'ajout de combattants
        Hooks.on('createCombatant', (combatant) => {
            const combat = game.combat;
            if (combat && this.timelineContainer) {
                this.updateCombatants(combat);
            }
        });
    }

    onCombatStart(combat) {
        if (!combat) return;
        
        // Ne pas réafficher si déjà visible
        if (!this.isVisible) {
            this.isVisible = true;
            if (this.timelineContainer) {
                this.timelineContainer.classList.remove('hidden');
            }
        }
        
        this.updateCombatants(combat);
    }

    onCombatUpdate(combat) {
        if (!combat || !this.isCombatStarted) {
            return;
        }
        
        this.updateCombatants(combat);
        
        // Mise à jour du numéro de manche
        const roundCounter = this.timelineContainer.querySelector('.round-counter');
        if (roundCounter) {
            roundCounter.textContent = `${game.i18n.localize('SCIFIBATTLE.UI.Round')} ${combat.round}`;
        }

        // Si le tour a changé, afficher la notification et mettre à jour le halo
        if (combat.current?.combatantId) {
            
            const currentCombatant = combat.turns[combat.turn];
            if (currentCombatant) {
                this.showTurnNotification(currentCombatant);
                this.updateTokenAura(currentCombatant);
            }
        }
    }

    onCombatEnd() {
        this.isVisible = false;
        if (this.timelineContainer) {
            this.timelineContainer.classList.add('hidden');
        }
        
        // Nettoyer les effets visuels
        this.clearCurrentTokenEffect();

        // Réinitialiser le compteur de round
        const roundCounter = this.timelineContainer.querySelector('.round-counter');
        if (roundCounter) {
            roundCounter.textContent = `${game.i18n.localize('SCIFIBATTLE.UI.Round')} 1`;
        }
    }

    nextTurn() {
        const combat = game.combat;
        if (!combat) return;
        combat.nextTurn();
    }

    previousTurn() {
        const combat = game.combat;
        if (!combat) return;
        combat.previousTurn();
    }

    nextRound() {
        const combat = game.combat;
        if (!combat) return;
        combat.nextRound();
    }

    previousRound() {
        const combat = game.combat;
        if (!combat) return;
        combat.previousRound();
    }

    toggleVisibility() {
        this.isVisible = !this.isVisible;
        if (this.timelineContainer) {
            this.timelineContainer.classList.toggle('hidden', !this.isVisible);
        }
    }

    updateTurnMarker() {
        const combat = game.combat;
        if (!combat || !this.timelineContainer) return;

        const track = this.timelineContainer.querySelector('.timeline-track');
        if (!track) return;

        // Mise à jour du marqueur de tour
        if (!this.currentTurnMarker) {
            this.currentTurnMarker = document.createElement('div');
            this.currentTurnMarker.classList.add('current-turn-marker');
            track.appendChild(this.currentTurnMarker);
        }

        // Calcul de la position
        const totalWidth = track.offsetWidth;
        const combatants = combat.turns.length;
        const position = (combat.turn / Math.max(combatants - 1, 1)) * (totalWidth - 24);
        
        this.currentTurnMarker.style.left = `${position}px`;
        
        // Mise à jour du compteur de rounds
        const roundCounter = this.timelineContainer.querySelector('.round-counter');
        if (roundCounter) {
            roundCounter.textContent = `${game.i18n.localize('SCIFIBATTLE.UI.Round')} ${combat.round}`;
        }
    }

    updateCombatants(combat) {
        if (!combat) return;

        const container = this.timelineContainer.querySelector('.combatants-container');
        if (!container) return;

        container.innerHTML = '';

        // Si le combat n'est pas encore démarré, utiliser les combattants dans l'ordre d'ajout
        const combatants = combat.started ? combat.turns : combat.combatants;
        
        // Convertir la collection en tableau et trier
        const sortedCombatants = Array.from(combatants).sort((a, b) => {
            const initA = Number(a.initiative) || 0;
            const initB = Number(b.initiative) || 0;
            return initB - initA;  // Tri décroissant
        });

        // Calculer l'initiative maximale pour les barres de progression
        const maxInit = Math.max(...sortedCombatants.map(c => c.initiative || 0));

        // Créer les éléments pour chaque combattant dans l'ordre de Foundry
        sortedCombatants.forEach((combatant, index) => {
            if (!combatant || !combatant.token) return;
            
            const row = document.createElement('div');
            row.className = 'combatant-row';
            if (!combatant.initiative) row.classList.add('no-initiative');
            
            // Ajouter la classe active si c'est le tour actuel
            if (combat.current?.combatantId === combatant.id) {
                row.classList.add('active');
            }
            
            // Afficher "?" si l'initiative n'est pas encore lancée
            const initiativeDisplay = combatant.initiative !== null 
                ? combatant.initiative 
                : '?';
            
            // Calculer la largeur de la barre d'initiative
            let barWidth = 0;
            if (combatant.initiative !== null && maxInit > 0) {
                barWidth = (combatant.initiative / maxInit) * 100;
            }
            
            // Ajouter une classe pour les lignes sans initiative
            if (combatant.initiative === null) {
                row.classList.add('no-initiative');
            }
            
            // Vérifier si le combattant est mort directement depuis le combattant
            const isDead = combatant.isDefeated;
            
            row.innerHTML = `
                <div class="combatant-token" style="background-image: url('${combatant.token.texture.src}')">
                    ${isDead ? '<div class="dead-overlay"><i class="fas fa-skull"></i></div>' : ''}
                </div>
                <div class="combatant-info">
                    <div class="combatant-name">${combatant.name}, initiative : ${initiativeDisplay}</div>
                    <div class="initiative-bar ${combatant.initiative === null ? 'hidden' : ''}">
                        <div class="initiative-progress" style="width: ${barWidth}%"></div>
                    </div>
                </div>
                <div class="combatant-actions">
                    ${combatant.initiative === null ? `<button class="roll-initiative" data-combatant-id="${combatant.id}">🎲</button>` : ''}
                </div>
            `;
            
            // Insérer au début de la timeline au lieu de la fin
            container.insertBefore(row, container.firstChild);

            // Ajouter l'écouteur d'événements pour le bouton de lancement d'initiative
            const rollButton = row.querySelector('.roll-initiative');
            if (rollButton) {
                rollButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const combatantId = rollButton.dataset.combatantId;
                    const combatant = combat.combatants.get(combatantId);
                    if (combatant) {
                        await game.combat.rollInitiative([combatantId]);
                        this.updateCombatants(game.combat);
                    }
                });
            }
        });
    }

    endCombat() {
        const combat = game.combat;
        if (!combat || !game.user.isGM) return;

        // Créer la popup de confirmation stylisée
        const confirm = document.createElement('div');
        confirm.className = 'initiative-confirm';
        
        confirm.innerHTML = `
            <h3>${game.i18n.localize('SCIFIBATTLE.Dialogs.EndCombat.Title')}</h3>
            <p>${game.i18n.localize('SCIFIBATTLE.Dialogs.EndCombat.Message')}</p>
            <div class="initiative-confirm-buttons">
                <button class="confirm-button confirm">${game.i18n.localize('SCIFIBATTLE.Buttons.Confirm')}</button>
                <button class="confirm-button cancel">${game.i18n.localize('SCIFIBATTLE.Buttons.Cancel')}</button>
            </div>
        `;
        
        document.body.appendChild(confirm);
        
        // Animation d'entrée
        setTimeout(() => confirm.classList.add('show'), 10);
        
        // Gérer les boutons
        const confirmBtn = confirm.querySelector('.confirm');
        const cancelBtn = confirm.querySelector('.cancel');
        
        confirmBtn.addEventListener('click', async () => {
            // Utiliser deleteCombat directement au lieu de endCombat pour éviter la confirmation
            await combat.delete();
            closeConfirm();
        });
        
        cancelBtn.addEventListener('click', closeConfirm);
        
        function closeConfirm() {
            confirm.classList.remove('show');
            setTimeout(() => confirm.remove(), 300);
        }
    }

    showTurnNotification(combatant) {
        // Ne pas afficher de notification si le combat n'est pas démarré
        if (!game.combat?.started) return;

        console.log("Sci-Fi Battle Timeline | showTurnNotification appelé pour", combatant.name, "isGM:", game.user.isGM);
        
        // Seul le MJ met à jour l'aura
        if (game.user.isGM) {
            this.updateTokenAura(combatant);
        }

        // Créer la notification localement pour tout le monde
        console.log("Sci-Fi Battle Timeline | Création de la notification pour", combatant.name);
        
        // Supprimer immédiatement toute notification existante et ses timers
        if (this.turnNotification) {
            clearTimeout(this.hideTimeout);
            clearTimeout(this.removeTimeout);
            this.turnNotification.remove();
        }

        // Créer la nouvelle notification
        this.turnNotification = document.createElement('div');
        this.turnNotification.className = 'turn-notification';
        
        // Ajouter la classe hostile si le token est hostile
        if (combatant.token.disposition === -1) {
            this.turnNotification.classList.add('hostile');
        }
        
        // Vérifier si le combattant est mort directement depuis le combattant
        const isDead = combatant.isDefeated;
        
        const template = `
            <div class="turn-notification-content">
                <div class="turn-token" style="background-image: url('${combatant.token.texture.src}')">
                    ${isDead ? '<div class="dead-overlay"><i class="fas fa-skull"></i></div>' : ''}
                </div>
                <div class="turn-message">
                    <h2>${combatant.name}</h2>
                    <p>${game.i18n.localize('SCIFIBATTLE.Notifications.YourTurn')}</p>
                </div>
            </div>
        `;
        
        this.turnNotification.innerHTML = template;
        document.body.appendChild(this.turnNotification);

        // Jouer un son de notification
        if (game.settings.get("core", "globalAmbientVolume") > 0) {
            AudioHelper.play({src: "sounds/notify.wav", volume: 0.5, autoplay: true, loop: false}, true);
        }

        // Animation du bandeau (pseudo-élément)
        gsap.fromTo(this.turnNotification,
            {
                opacity: 0,
                scaleY: 0
            },
            {
                opacity: 1,
                scaleY: 1,
                duration: 0.3,
                ease: "power2.out"
            }
        );

        // Animation du contenu
        gsap.fromTo(this.turnNotification.querySelector('.turn-notification-content'),
            {
                opacity: 0,
                x: window.innerWidth
            },
            {
                opacity: 1,
                x: 0,
                duration: 0.5,
                delay: 0.2,
                ease: "power2.out"
            }
        );

        // Animation du token
        gsap.fromTo(this.turnNotification.querySelector('.turn-token'),
            {
                scale: 0,
                rotation: 180
            },
            {
                scale: 1,
                rotation: 0,
                duration: 0.5,
                delay: 0.4,
                ease: "back.out(1.7)"
            }
        );

        // Animation du texte
        gsap.from(this.turnNotification.querySelector('.turn-message h2'), {
            y: -20,
            opacity: 0,
            duration: 0.5,
            delay: 0.5
        });

        gsap.from(this.turnNotification.querySelector('.turn-message p'), {
            y: 20,
            opacity: 0,
            duration: 0.5,
            delay: 0.6
        });

        // Animation de sortie
        this.hideTimeout = setTimeout(() => {
            if (this.turnNotification) {
                // Sortie du contenu
                gsap.to(this.turnNotification.querySelector('.turn-notification-content'), {
                    opacity: 0,
                    x: -window.innerWidth,
                    duration: 0.5,
                    ease: "power2.in"
                });
                
                // Sortie du bandeau
                gsap.to(this.turnNotification, {
                    opacity: 0,
                    scaleY: 0,
                    duration: 0.3,
                    delay: 0.3,
                    ease: "power2.in",
                    onComplete: () => {
                        if (this.turnNotification) {
                            this.turnNotification.remove();
                        }
                    }
                });
            }
        }, 3000);

        // Après avoir affiché la notification du tour actuel, vérifier le prochain combattant
        this.showNextTurnWarning();
    }

    showNextTurnWarning() {
        const combat = game.combat;
        if (!combat || !combat.started) return;

        // Calculer l'index du prochain combattant
        const nextTurn = (combat.turn + 1) % combat.turns.length;
        const nextCombatant = combat.turns[nextTurn];

        // Vérifier si le prochain combattant appartient au joueur actuel
        // Ne pas montrer le message si c'est le MJ
        if (nextCombatant && 
            nextCombatant.actor?.hasPlayerOwner && 
            nextCombatant.actor.isOwner && 
            !nextCombatant.isDefeated && 
            !game.user.isGM) {
            // Créer la notification d'avertissement
            const warning = document.createElement('div');
            warning.className = 'turn-notification next-turn-warning';
            
            warning.innerHTML = `
                <div class="turn-notification-content">
                    <div class="turn-token" style="background-image: url('${nextCombatant.token.texture.src}')"></div>
                    <div class="turn-message">
                        <h2><i class="fas fa-exclamation-triangle"></i> ${game.i18n.localize('SCIFIBATTLE.Notifications.Warning')}</h2>
                        <p>${game.i18n.localize('SCIFIBATTLE.Notifications.NextTurn')}</p>
                    </div>
                </div>
            `;
            
            document.body.appendChild(warning);
            
            // Animation d'entrée
            gsap.fromTo(warning,
                {
                    opacity: 0,
                    y: 50
                },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.5,
                    ease: "power2.out"
                }
            );

            // Auto-suppression après 3 secondes
            setTimeout(() => {
                gsap.to(warning, {
                    opacity: 0,
                    y: -50,
                    duration: 0.5,
                    ease: "power2.in",
                    onComplete: () => warning.remove()
                });
            }, 3000);
        }
    }

    rollNPCInitiative() {
        if (!game.combat) {
            return;
        }

        const npcs = game.combat.combatants.filter(c => !c.actor?.hasPlayerOwner);
        game.combat.rollNPC(npcs);
    }

    rollAllInitiative() {
        if (!game.combat) {
            return;
        }

        game.combat.rollAll();
    }

    showInitiativeConfirm(type) {
        const confirm = document.createElement('div');
        confirm.className = 'initiative-confirm';
        
        const message = type === 'PNJ' ? 
            game.i18n.localize('SCIFIBATTLE.Dialogs.Initiative.NPCMessage') : 
            game.i18n.localize('SCIFIBATTLE.Dialogs.Initiative.AllMessage');
        
        confirm.innerHTML = `
            <h3>${game.i18n.localize('SCIFIBATTLE.Dialogs.Initiative.Title')}</h3>
            <p>${message}</p>
            <div class="initiative-confirm-buttons">
                <button class="confirm-button confirm">${game.i18n.localize('SCIFIBATTLE.Buttons.Confirm')}</button>
                <button class="confirm-button cancel">${game.i18n.localize('SCIFIBATTLE.Buttons.Cancel')}</button>
            </div>
        `;
        
        document.body.appendChild(confirm);
        
        setTimeout(() => {
            confirm.classList.add('show');
        }, 10);
        
        const confirmBtn = confirm.querySelector('.confirm');
        const cancelBtn = confirm.querySelector('.cancel');
        
        confirmBtn.addEventListener('click', () => {
            if (type === 'PNJ') {
                this.rollNPCInitiative();
            } else {
                this.rollAllInitiative();
            }
            closeConfirm();
        });
        
        cancelBtn.addEventListener('click', () => {
            console.log('Combat Timeline | Annulation initiative', type);
            closeConfirm();
        });
        
        function closeConfirm() {
            confirm.classList.remove('show');
            setTimeout(() => {
                confirm.remove();
            }, 300);
        }
    }

    startCombat() {
        if (!game.user.isGM) return;
        
        const combat = game.combat;
        if (!combat) {
            ui.notifications.warn(game.i18n.localize('SCIFIBATTLE.Warnings.NoCombat'));
            return;
        }
        
        if (combat.started) {
            ui.notifications.warn(game.i18n.localize('SCIFIBATTLE.Warnings.CombatStarted'));
            return;
        }

        // Vérifier si toutes les initiatives sont lancées
        const hasUnrolledInitiative = combat.combatants.some(c => c.initiative === null);
        if (hasUnrolledInitiative) {
            ui.notifications.warn(game.i18n.localize('SCIFIBATTLE.Warnings.UnrolledInitiative'));
            return;
        }
        
        combat.startCombat();
    }

    updateTokenAura(combatant) {
        console.log("Combat Timeline | updateTokenAura - Début", combatant);

        // Nettoyer l'ancien effet
        this.clearCurrentTokenEffect();

        if (!combatant?.token) {
            console.warn("Combat Timeline | Pas de token valide");
            return;
        }

        const token = canvas.tokens.placeables.find(t => t.id === combatant.token.id);
        if (!token) {
            console.warn("Combat Timeline | Token non trouvé sur le canvas");
            return;
        }

        // Sauvegarder l'ID du token actif
        this.currentActiveToken = token.id;

        // Définir la couleur en fonction de la disposition du token
        const color = token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE ? 0xFF0000 : 0x00FF00;

        // Appliquer l'effet visuel
        token.document.update({
            light: {
                bright: token.document.width,
                dim: token.document.width * 2,
                color: color,
                alpha: 0.5,
                animation: {
                    type: "pulse",
                    speed: 5,
                    intensity: 5
                }
            }
        });

        // Ajouter un effet de bordure
        token.border.visible = true;
        token.border.color = color;
        token.refresh();
    }

    clearCurrentTokenEffect() {
        if (this.currentActiveToken) {
            const oldToken = canvas.tokens.placeables.find(t => t.id === this.currentActiveToken);
            if (oldToken) {
                
                // Réinitialiser l'effet de lumière
                oldToken.document.update({
                    light: {
                        bright: 0,
                        dim: 0,
                        color: null,
                        alpha: 0,
                        animation: {
                            type: null,
                            speed: 5,
                            intensity: 5
                        }
                    }
                });

                // Réinitialiser la bordure
                oldToken.border.visible = false;
                oldToken.refresh();
            }
            this.currentActiveToken = null;
        }
    }

    // Gestion de l'aura du token actif
    updateTokenAura(combatant) {
        // Seul le MJ peut gérer les auras
        if (!game.user.isGM) {
            console.log("Sci-Fi Battle Timeline | Ignoré : seul le MJ peut gérer les auras");
            return;
        }

        console.log("Sci-Fi Battle Timeline | Mise à jour de l'aura du token", combatant?.name);
        
        // Enlever l'aura du token précédent
        if (this.currentAuraToken) {
            console.log("Sci-Fi Battle Timeline | Suppression de l'aura précédente");
            const previousToken = canvas.tokens.placeables.find(t => t.id === this.currentAuraToken);
            if (previousToken) {
                previousToken.document.update({
                    "light": {
                        "bright": 0,
                        "dim": 0,
                        "color": "",
                        "alpha": 0,
                        "animation": {
                            "type": "none"
                        }
                    }
                });
            }
            this.currentAuraToken = null;
        }

        // Ajouter l'aura au nouveau token si on est en combat
        if (combatant && game.combat?.started) {
            console.log("Sci-Fi Battle Timeline | Ajout de l'aura au nouveau token");
            const token = canvas.tokens.placeables.find(t => t.id === combatant.token.id);
            if (token) {
                // Obtenir la couleur du bandeau en fonction de la disposition du token
                let auraColor;
                switch(token.document.disposition) {
                    case CONST.TOKEN_DISPOSITIONS.FRIENDLY:
                        auraColor = "#00ff00"; // Vert pour les alliés
                        break;
                    case CONST.TOKEN_DISPOSITIONS.NEUTRAL:
                        auraColor = "#ffff00"; // Jaune pour les neutres
                        break;
                    case CONST.TOKEN_DISPOSITIONS.HOSTILE:
                        auraColor = "#ff0000"; // Rouge pour les ennemis
                        break;
                    default:
                        auraColor = "#ff9900"; // Orange par défaut
                }

                token.document.update({
                    "light": {
                        "bright": 0,
                        "dim": 1.5,
                        "color": auraColor,
                        "alpha": 0.5,
                        "animation": {
                            "type": "pulse",
                            "speed": 3,
                            "intensity": 3
                        }
                    }
                });
                this.currentAuraToken = token.id;
            }
        }
    }
}

// Classe pour le lien GitHub
class GitHubLink extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "scifi-battle-github-link",
            title: "GitHub",
            template: "templates/settings/menu.html"
        });
    }

    render() {
        window.open("https://github.com/Frenchy-s-module/Scifi-Battle", "_blank");
        return null;
    }
}

// Initialisation du module
Hooks.once('init', () => {
    console.log('Sci-Fi Battle Timeline | Initializing module');
    
    // Créer l'espace de nom global pour le module
    game.scifiBattle = {
        timeline: null
    };
});

// S'assurer que le module est correctement enregistré
Hooks.once('setup', () => {
    console.log("Sci-Fi Battle Timeline | Setup du module");
});

// Initialisation une fois que Foundry est prêt
Hooks.once('ready', () => {
    console.log("Sci-Fi Battle Timeline | Module prêt, initialisation de la timeline");
    
    // Créer l'instance de la timeline
    game.scifiBattle.timeline = new CombatTimeline();
    game.scifiBattle.timeline.initialize();
});

// Hook pour les changements de tour
Hooks.on('updateCombat', (combat, changed, options, userId) => {
    console.log("Sci-Fi Battle Timeline | Combat mis à jour", changed);
    
    // Mettre à jour la timeline pour tous les utilisateurs
    if (game.scifiBattle.timeline) {
        game.scifiBattle.timeline.updateCombatants(combat);

        // Mettre à jour le numéro de manche
        const roundTitle = document.getElementById('combat-round');
        if (roundTitle) {
            if (combat.started) {
                roundTitle.textContent = `Manche ${combat.round}`;
            } else {
                roundTitle.textContent = 'Préparation du combat';
            }
        }
    }
    
    // Ne pas afficher de notification si le combat n'est pas démarré
    if (!combat.started) return;

    // Vérifier si le combat vient de démarrer
    if (changed.round === 1 && changed.turn === 0) {
        const combatant = combat.combatant;
        if (combatant) {
            console.log("Sci-Fi Battle Timeline | Combat démarré, premier tour pour", combatant.name);
            if (game.scifiBattle.timeline) {
                game.scifiBattle.timeline.showTurnNotification(combatant);
            }
        }
    }
    // Sinon, vérifier si c'est un changement de tour normal pendant le combat
    else if (changed.turn !== undefined) {
        const combatant = combat.combatant;
        if (combatant) {
            console.log("Sci-Fi Battle Timeline | Nouveau tour pour", combatant.name);
            if (game.scifiBattle.timeline) {
                game.scifiBattle.timeline.showTurnNotification(combatant);
            }
        }
    }
});

// Hook pour le début du combat
Hooks.on('createCombat', (combat) => {
    console.log("Sci-Fi Battle Timeline | Nouveau combat créé");
    // Ne pas montrer de notification à la création, attendre le démarrage
    if (game.scifiBattle.timeline && game.user.isGM) {
        game.scifiBattle.timeline.updateCombatants(combat);
    }
});

// Hook pour le démarrage du combat
Hooks.on('combatStart', (combat) => {
    console.log("Sci-Fi Battle Timeline | Combat démarré");
    if (game.scifiBattle.timeline) {
        // Mettre à jour la timeline et montrer la notification pour le premier combattant
        game.scifiBattle.timeline.updateCombatants(combat);
        if (combat.combatant) {
            game.scifiBattle.timeline.showTurnNotification(combat.combatant);
        }
    }
});

// Hook pour la fin du combat
Hooks.on('deleteCombat', (combat, options, userId) => {
    console.log("Sci-Fi Battle Timeline | Combat terminé");
    if (game.scifiBattle.timeline && game.user.isGM) {
        // Supprimer toutes les auras
        game.scifiBattle.timeline.updateTokenAura(null);
    }
});
