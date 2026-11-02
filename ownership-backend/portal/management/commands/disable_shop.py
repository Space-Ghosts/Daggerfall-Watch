from django.core.management.base import BaseCommand, CommandError
from portal.models import ShopProfile, Audit
class Command(BaseCommand):
    help='Operator-only: disable public customization and editing for one exact shop.'
    def add_arguments(self,parser): parser.add_argument('shop_key');parser.add_argument('--enable',action='store_true')
    def handle(self,*args,**options):
        key=options['shop_key']
        if not ShopProfile.objects.filter(key=key).update(disabled=not options['enable']): raise CommandError('Claimed shop not found.')
        Audit.objects.create(action='operator-enable' if options['enable'] else 'operator-disable',shop_key=key)
        self.stdout.write('Updated. The next owner worker run republishes the shop.')
