from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.models import User

class RegisterForm(UserCreationForm):
    username = forms.RegexField(regex=r'^[a-zA-Z0-9_]{3,30}$',label='Website username',help_text='3–30 letters, numbers or underscores. This is a separate website account, not your game login.')
    class Meta:
        model=User
        fields=('username',)
    def clean_username(self):
        name=self.cleaned_data['username'].lower()
        if User.objects.filter(username__iexact=name).exists(): raise forms.ValidationError('Choose another website username.')
        return name

class LoginForm(AuthenticationForm):
    username=forms.CharField(label='Website username',max_length=30)
    def clean_username(self): return self.cleaned_data['username'].lower()

class UploadForm(forms.Form):
    image=forms.FileField(label='Choose image',widget=forms.ClearableFileInput(attrs={'accept':'image/jpeg,image/png,image/webp'}))
    caption=forms.CharField(max_length=120,required=False,label='Screenshot description')

class FeatureForm(forms.Form):
    first=forms.ChoiceField(label='First featured item',required=False)
    second=forms.ChoiceField(label='Second featured item',required=False)
    third=forms.ChoiceField(label='Third featured item',required=False)
    def __init__(self,*args,rows=(),initial_ids=(),**kwargs):
        super().__init__(*args,**kwargs)
        choices=[('','Automatic: best available stock')]+[(r['id'],f"{r['name']} · {r['price']:,} {r['currency']}") for r in rows]
        for i,k in enumerate(('first','second','third')):
            self.fields[k].choices=choices
            if len(initial_ids)>i: self.fields[k].initial=initial_ids[i]
    def clean(self):
        values=super().clean()
        ids=[values.get(k) for k in ('first','second','third') if values.get(k)]
        if len(ids)!=len(set(ids)): raise forms.ValidationError('Choose each featured listing only once.')
        return values
