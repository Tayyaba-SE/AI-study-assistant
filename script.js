const input = document.querySelector(".question-input");
const button = document.querySelector(".ask-btn");
const response = document.querySelector(".response");

button.addEventListener("click", function(){

    response.innerHTML +=
    `<div class="user-message">
        ${input.value}
    </div>`;

});